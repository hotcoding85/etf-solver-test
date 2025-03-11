const logger = require('../utils/logger');
const { sleep } = require('../utils/helpers');
const { RATE_LIMIT_WINDOW_MS } = require('../utils/constants');

/**
 * Processes orders and handles execution logic
 */
class OrderProcessor {
  /**
   * Create a new order processor
   * @param {Object} queueManager - The queue manager instance
   * @param {Object} liquidityAnalyzer - The liquidity analyzer instance
   * @param {Object} binanceAdapter - The Binance API adapter
   * @param {Object} rebalanceManager - The rebalance manager
   * @param {Map<string, Index>} indices - Map of indices by ID
   */
  constructor(queueManager, liquidityAnalyzer, binanceAdapter, rebalanceManager, indices) {
    this.queueManager = queueManager;
    this.liquidityAnalyzer = liquidityAnalyzer;
    this.binanceAdapter = binanceAdapter;
    this.rebalanceManager = rebalanceManager;
    this.indices = indices;
    this.isRunning = false;
    this.processingInterval = null;
  }

  /**
   * Start the order processor
   * @param {number} intervalMs - The interval between processing batches (default: RATE_LIMIT_WINDOW_MS)
   */
  start(intervalMs = RATE_LIMIT_WINDOW_MS) {
    if (this.isRunning) {
      logger.warn('Order processor is already running');
      return;
    }
    
    this.isRunning = true;
    logger.info('Order processor started');
    
    this.processingInterval = setInterval(() => {
      this.processBatch();
    }, intervalMs);
  }

  /**
   * Stop the order processor
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Order processor is not running');
      return;
    }
    
    clearInterval(this.processingInterval);
    this.processingInterval = null;
    this.isRunning = false;
    
    logger.info('Order processor stopped');
  }

  /**
   * Process a batch of orders
   */
  async processBatch() {
    if (this.queueManager.isProcessing) {
      logger.debug('Queue manager is already processing a batch');
      return;
    }
    
    // Get the next batch of orders to process
    const batch = await this.queueManager.getNextBatch(this.liquidityAnalyzer, this.indices);
    
    if (batch.length === 0) {
      logger.debug('No orders to process in this batch');
      return;
    }
    
    logger.info(`Processing batch of ${batch.length} orders`);
    
    try {
      // Process each order in the batch
      const processedOrders = await Promise.all(batch.map(order => this.processOrder(order)));
      
      // Mark the batch as completed
      this.queueManager.completeBatch(processedOrders);
    } catch (error) {
      logger.error(`Error processing batch: ${error.message}`);
    }
  }

  /**
   * Process a single order
   * @param {Order} order - The order to process
   * @return {Order} The processed order
   */
  async processOrder(order) {
    logger.info(`Processing order ${order.id} (type: ${order.type}, position: ${order.positionId})`);
    
    try {
      order.updateStatus('processing');
      
      switch (order.type) {
        case 'buy':
          await this.processBuyOrder(order);
          break;
        case 'sell':
          await this.processSellOrder(order);
          break;
        case 'cancel':
          await this.processCancelOrder(order);
          break;
        case 'rebalance':
          await this.processRebalanceOrder(order);
          break;
        default:
          throw new Error(`Unknown order type: ${order.type}`);
      }
    } catch (error) {
      logger.error(`Error processing order ${order.id}: ${error.message}`);
      order.updateStatus('failed', { execution: { error: error.message } });
    }
    
    return order;
  }

  /**
   * Process a buy order
   * @param {Order} order - The buy order to process
   */
  async processBuyOrder(order) {
    const index = this.indices.get(order.indexId);
    
    if (!index) {
      throw new Error(`Index ${order.indexId} not found`);
    }
    
    // Check if the order is triggerable (limit price >= current price for buy)
    const currentPrice = index.getCurrentPrice();
    
    if (order.indexPrice < currentPrice) {
      logger.info(`Buy order ${order.id} not triggerable (limit: ${order.indexPrice}, current: ${currentPrice})`);
      return order.updateStatus('pending', { 
        execution: { 
          message: 'Price condition not met',
          currentPrice,
          limitPrice: order.indexPrice
        } 
      });
    }
    
    // Analyze liquidity and determine how much we can fill
    const liquidityResult = await this.liquidityAnalyzer.analyzeOrderLiquidity(
      order, 
      index,
      this.binanceAdapter
    );
    
    if (liquidityResult.fillablePercent === 0) {
      logger.info(`Buy order ${order.id} has no fillable liquidity`);
      return order.updateStatus('pending', {
        execution: {
          message: 'No fillable liquidity',
          liquidityAnalysis: liquidityResult
        }
      });
    }
    
    // Execute the order on Binance
    try {
      const executionResult = await this.binanceAdapter.executeOrder(
        'buy',
        liquidityResult.assetOrders,
        order.positionId
      );
      
      // Calculate fill percentage and loss
      const fillPercentage = executionResult.filled / order.quantity * 100;
      const loss = executionResult.loss;
      
      // Update the order status
      if (fillPercentage >= 99.5) {
        order.updateStatus('filled', {
          fillPercentage: 100,
          loss,
          execution: executionResult
        });
      } else {
        order.updateStatus('partially_filled', {
          fillPercentage,
          loss,
          execution: executionResult
        });
      }
      
      logger.info(`Buy order ${order.id} executed (fill: ${fillPercentage.toFixed(2)}%, loss: ${loss.toFixed(2)})`);
    } catch (error) {
      logger.error(`Error executing buy order ${order.id}: ${error.message}`);
      order.updateStatus('failed', {
        execution: { error: error.message }
      });
    }
    
    return order;
  }

  /**
   * Process a sell order
   * @param {Order} order - The sell order to process
   */
  async processSellOrder(order) {
    const index = this.indices.get(order.indexId);
    
    if (!index) {
      throw new Error(`Index ${order.indexId} not found`);
    }
    
    // Check if the order is triggerable (limit price <= current price for sell)
    const currentPrice = index.getCurrentPrice();
    
    if (order.indexPrice > currentPrice) {
      logger.info(`Sell order ${order.id} not triggerable (limit: ${order.indexPrice}, current: ${currentPrice})`);
      return order.updateStatus('pending', { 
        execution: { 
          message: 'Price condition not met',
          currentPrice,
          limitPrice: order.indexPrice
        } 
      });
    }
    
    // Analyze liquidity and determine how much we can fill
    const liquidityResult = await this.liquidityAnalyzer.analyzeOrderLiquidity(
      order, 
      index,
      this.binanceAdapter,
      'sell'
    );
    
    if (liquidityResult.fillablePercent === 0) {
      logger.info(`Sell order ${order.id} has no fillable liquidity`);
      return order.updateStatus('pending', {
        execution: {
          message: 'No fillable liquidity',
          liquidityAnalysis: liquidityResult
        }
      });
    }
    
    // Execute the order on Binance
    try {
      const executionResult = await this.binanceAdapter.executeOrder(
        'sell',
        liquidityResult.assetOrders,
        order.positionId
      );
      
      // Calculate fill percentage and loss
      const fillPercentage = executionResult.filled / order.quantity * 100;
      const loss = executionResult.loss;
      
      // Update the order status
      if (fillPercentage >= 99.5) {
        order.updateStatus('filled', {
          fillPercentage: 100,
          loss,
          execution: executionResult
        });
      } else {
        order.updateStatus('partially_filled', {
          fillPercentage,
          loss,
          execution: executionResult
        });
      }
      
      logger.info(`Sell order ${order.id} executed (fill: ${fillPercentage.toFixed(2)}%, loss: ${loss.toFixed(2)})`);
    } catch (error) {
      logger.error(`Error executing sell order ${order.id}: ${error.message}`);
      order.updateStatus('failed', {
        execution: { error: error.message }
      });
    }
    
    return order;
  }

  /**
   * Process a cancel order
   * @param {Order} order - The cancel order to process
   */
  async processCancelOrder(order) {
    // Find the order to cancel
    const orderToCancel = this.queueManager.getOrderByPositionId(order.positionId);
    
    if (!orderToCancel) {
      logger.warn(`Order to cancel with position ID ${order.positionId} not found`);
      order.updateStatus('failed', {
        execution: { error: `Order with position ID ${order.positionId} not found` }
      });
      return order;
    }
    
    // Check the order status
    if (orderToCancel.isComplete()) {
      logger.info(`Order ${orderToCancel.id} already completed, cannot cancel`);
      order.updateStatus('failed', {
        execution: { 
          error: `Order ${orderToCancel.id} already completed with status ${orderToCancel.status}` 
        }
      });
      return order;
    }
    
    // If the order is still in the queue (not processing), simply remove it
    if (orderToCancel.status === 'pending') {
      this.queueManager.removeOrderByPositionId(order.positionId);
      orderToCancel.updateStatus('canceled', {
        execution: { message: 'Order canceled while in queue' }
      });
      
      order.updateStatus('filled', {
        execution: { 
          message: `Successfully canceled order ${orderToCancel.id}`,
          canceledOrder: orderToCancel.toObject()
        }
      });
      
      logger.info(`Canceled pending order ${orderToCancel.id}`);
      return order;
    }
    
    // If the order is being processed, try to cancel it on Binance
    if (orderToCancel.status === 'processing') {
      try {
        // Get the index for the order
        const index = this.indices.get(orderToCancel.indexId);
        if (!index) {
          throw new Error(`Index ${orderToCancel.indexId} not found`);
        }
        
        // Cancel the order on Binance
        const cancelResult = await this.binanceAdapter.cancelOrder(
          orderToCancel.positionId,
          orderToCancel.type
        );
        
        // Update the original order's status
        orderToCancel.updateStatus('canceled', {
          fillPercentage: cancelResult.fillPercentage,
          loss: cancelResult.loss,
          execution: cancelResult
        });
        
        // Update the cancel order's status
        order.updateStatus('filled', {
          execution: {
            message: `Successfully canceled order ${orderToCancel.id}`,
            canceledOrder: orderToCancel.toObject(),
            cancelResult
          }
        });
        
        logger.info(`Canceled processing order ${orderToCancel.id} (fill: ${cancelResult.fillPercentage.toFixed(2)}%, loss: ${cancelResult.loss.toFixed(2)})`);
      } catch (error) {
        logger.error(`Error canceling order ${orderToCancel.id}: ${error.message}`);
        order.updateStatus('failed', {
          execution: { error: error.message }
        });
      }
    }
    
    return order;
  }

  /**
   * Process a rebalance order
   * @param {Order} order - The rebalance order to process
   */
  async processRebalanceOrder(order) {
    const index = this.indices.get(order.indexId);
    
    if (!index) {
      throw new Error(`Index ${order.indexId} not found`);
    }
    
    try {
      // Get the rebalance plan from the rebalance manager
      const rebalancePlan = await this.rebalanceManager.createRebalancePlan(index, this.binanceAdapter);
      
      // Execute the rebalance
      const rebalanceResult = await this.rebalanceManager.executeRebalance(
        index,
        rebalancePlan,
        this.binanceAdapter
      );
      
      // Update the order status
      order.updateStatus('filled', {
        loss: rebalanceResult.totalLoss,
        execution: {
          rebalancePlan,
          rebalanceResult
        }
      });
      
      logger.info(`Rebalance order ${order.id} executed (loss: ${rebalanceResult.totalLoss.toFixed(2)})`);
    } catch (error) {
      logger.error(`Error executing rebalance order ${order.id}: ${error.message}`);
      order.updateStatus('failed', {
        execution: { error: error.message }
      });
    }
    
    return order;
  }
}

module.exports = OrderProcessor;
