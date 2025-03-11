const logger = require('../utils/logger');
const { RATE_LIMIT, RATE_LIMIT_WINDOW_MS } = require('../utils/constants');

/**
 * Manages order queues and rate limiting for order processing
 */
class QueueManager {
  constructor() {
    this.queues = {
      buy: [],
      sell: [],
      cancel: [],
      rebalance: []
    };
    
    this.processing = {
      buy: [],
      sell: [],
      cancel: [],
      rebalance: []
    };
    
    this.executionHistory = [];
    this.lastBatchTime = Date.now();
    this.ordersInCurrentBatch = 0;
    this.isProcessing = false;
  }

  /**
   * Add an order to the appropriate queue
   * @param {Order} order - The order to queue
   */
  queueOrder(order) {
    if (!this.queues[order.type]) {
      logger.error(`Invalid order type: ${order.type}`);
      return false;
    }
    
    this.queues[order.type].push(order);
    logger.info(`Order ${order.id} queued (type: ${order.type}, position: ${order.positionId})`);
    return true;
  }

  /**
   * Get an order by position ID
   * @param {string} positionId - The position ID to look for
   * @return {Order|null} The order if found, null otherwise
   */
  getOrderByPositionId(positionId) {
    // Look in all queues and processing lists
    for (const type of Object.keys(this.queues)) {
      // Check queues
      const queueOrder = this.queues[type].find(order => order.positionId === positionId);
      if (queueOrder) return queueOrder;
      
      // Check processing
      const processingOrder = this.processing[type].find(order => order.positionId === positionId);
      if (processingOrder) return processingOrder;
    }
    
    return null;
  }

  /**
   * Remove an order from all queues by position ID
   * @param {string} positionId - The position ID to remove
   * @return {Order|null} The removed order if found, null otherwise
   */
  removeOrderByPositionId(positionId) {
    for (const type of Object.keys(this.queues)) {
      const index = this.queues[type].findIndex(order => order.positionId === positionId);
      if (index !== -1) {
        const removedOrder = this.queues[type].splice(index, 1)[0];
        logger.info(`Order ${removedOrder.id} removed from queue (type: ${removedOrder.type}, position: ${removedOrder.positionId})`);
        return removedOrder;
      }
    }
    
    return null;
  }

  /**
   * Get the next batch of orders to process based on rate limit
   * @param {Object} liquidityAnalyzer - LiquidityAnalyzer instance to prioritize orders
   * @param {Map<string, Index>} indices - Map of indices by ID
   * @return {Array<Order>} The batch of orders to process
   */
  async getNextBatch(liquidityAnalyzer, indices = new Map()) {
    // If we're already processing the maximum allowed orders, wait
    if (this.isProcessing) {
      logger.debug('Already processing a batch of orders');
      return [];
    }
    
    // Check if we need to wait for rate limiting
    const now = Date.now();
    const timeSinceLastBatch = now - this.lastBatchTime;
    
    if (timeSinceLastBatch < RATE_LIMIT_WINDOW_MS && this.ordersInCurrentBatch >= RATE_LIMIT) {
      const waitTime = RATE_LIMIT_WINDOW_MS - timeSinceLastBatch;
      logger.info(`Rate limit reached. Need to wait ${waitTime}ms before processing next batch`);
      return [];
    }
    
    // If we've passed the rate limit window, reset the counter
    if (timeSinceLastBatch >= RATE_LIMIT_WINDOW_MS) {
      this.lastBatchTime = now;
      this.ordersInCurrentBatch = 0;
    }
    
    // Process cancellations first (they're typically urgent)
    const cancellations = this.queues.cancel.splice(0, RATE_LIMIT - this.ordersInCurrentBatch);
    this.processing.cancel.push(...cancellations);
    
    const remainingCapacity = RATE_LIMIT - this.ordersInCurrentBatch - cancellations.length;
    
    if (remainingCapacity <= 0) {
      this.ordersInCurrentBatch += cancellations.length;
      this.isProcessing = true;
      return cancellations;
    }
    
    // Then process rebalances (they're typically scheduled)
    const rebalances = this.queues.rebalance.splice(0, remainingCapacity);
    this.processing.rebalance.push(...rebalances);
    
    let remainingCapacityAfterRebalances = remainingCapacity - rebalances.length;
    
    if (remainingCapacityAfterRebalances <= 0) {
      this.ordersInCurrentBatch += cancellations.length + rebalances.length;
      this.isProcessing = true;
      return [...cancellations, ...rebalances];
    }
    
    // Now prioritize buy and sell orders based on liquidity
    let buyAndSellOrders = [];
    
    // If we have a liquidity analyzer object with prioritizeOrders method, use it
    if (liquidityAnalyzer && typeof liquidityAnalyzer.prioritizeOrders === 'function') {
      try {
        // Prepare all buy and sell orders for analysis
        const buyOrders = this.queues.buy.map(order => ({ order, type: 'buy' }));
        const sellOrders = this.queues.sell.map(order => ({ order, type: 'sell' }));
        const allOrders = [...buyOrders, ...sellOrders];
        
        // Get prioritized orders from the analyzer using the correct method
        const prioritizedOrders = await liquidityAnalyzer.prioritizeOrders(allOrders, indices, remainingCapacityAfterRebalances);
        
        if (Array.isArray(prioritizedOrders)) {
          // Extract the actual orders from the prioritized list
          buyAndSellOrders = prioritizedOrders.map(po => po.order);
          
          // Remove these orders from their respective queues
          for (const { order, type } of prioritizedOrders) {
            const index = this.queues[type].findIndex(o => o.id === order.id);
            if (index !== -1) {
              this.queues[type].splice(index, 1);
              this.processing[type].push(order);
            }
          }
        } else {
          logger.warn("prioritizeOrders did not return an array");
        }
      } catch (err) {
        logger.error(`Error in prioritizeOrders: ${err.message}`);
      }
    } else {
      // Simple FIFO if no liquidity analyzer provided
      const buys = this.queues.buy.splice(0, Math.floor(remainingCapacityAfterRebalances / 2));
      const sells = this.queues.sell.splice(0, remainingCapacityAfterRebalances - buys.length);
      
      this.processing.buy.push(...buys);
      this.processing.sell.push(...sells);
      
      buyAndSellOrders = [...buys, ...sells];
    }
    
    const batch = [...cancellations, ...rebalances, ...buyAndSellOrders];
    this.ordersInCurrentBatch += batch.length;
    this.isProcessing = true;
    
    logger.info(`Prepared batch of ${batch.length} orders (${cancellations.length} cancellations, ${rebalances.length} rebalances, ${buyAndSellOrders.length} buy/sell)`);
    
    return batch;
  }

  /**
   * Mark a batch of orders as completed and move to history
   * @param {Array<Order>} completedOrders - The orders that have been processed
   */
  completeBatch(completedOrders) {
    // Move the completed orders from processing to history
    for (const order of completedOrders) {
      const index = this.processing[order.type].findIndex(o => o.id === order.id);
      if (index !== -1) {
        this.processing[order.type].splice(index, 1);
        this.executionHistory.push(order);
      }
    }
    
    this.isProcessing = false;
    logger.info(`Completed batch of ${completedOrders.length} orders`);
  }

  /**
   * Get the queue statistics
   * @return {Object} Statistics about the current queue state
   */
  getStats() {
    const queueCounts = {};
    const processingCounts = {};
    
    for (const type of Object.keys(this.queues)) {
      queueCounts[type] = this.queues[type].length;
      processingCounts[type] = this.processing[type].length;
    }
    
    return {
      queued: queueCounts,
      processing: processingCounts,
      history: this.executionHistory.length,
      ordersInCurrentBatch: this.ordersInCurrentBatch,
      lastBatchTime: this.lastBatchTime,
      isProcessing: this.isProcessing
    };
  }

  /**
   * Clear all order queues and processing lists
   */
  clear() {
    for (const type of Object.keys(this.queues)) {
      this.queues[type] = [];
      this.processing[type] = [];
    }
    
    this.executionHistory = [];
    this.lastBatchTime = Date.now();
    this.ordersInCurrentBatch = 0;
    this.isProcessing = false;
    
    logger.info('Queue manager cleared');
  }
}

module.exports = QueueManager;
