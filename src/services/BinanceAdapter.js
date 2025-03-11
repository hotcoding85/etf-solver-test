const logger = require('../utils/logger');
const { sleep } = require('../utils/helpers');

/**
 * Adapter for Binance API operations
 * In a real implementation, this would use the Binance API client
 * Here we're simulating the Binance API for testing purposes
 */
class BinanceAdapter {
  constructor() {
    this.orderBooks = new Map();
    this.orders = new Map();
    this.executedOrders = [];
    this.requestCount = 0;
    this.lastRequestTime = Date.now();
  }

  /**
   * Get the order book for an asset
   * @param {string} assetId - The asset identifier
   * @return {Object} The order book with bids and asks
   */
  async getOrderBook(assetId) {
    // Simulate rate limiting
    await this.checkRateLimit();
    
    // Check if we have a cached order book
    if (!this.orderBooks.has(assetId)) {
      this.orderBooks.set(assetId, this.generateMockOrderBook(assetId));
    }
    
    logger.debug(`Retrieved order book for ${assetId}`);
    return this.orderBooks.get(assetId);
  }

  /**
   * Execute an order on Binance
   * @param {string} side - The order side (buy/sell)
   * @param {Array<Object>} assetOrders - The asset orders to execute
   * @param {string} positionId - The position ID
   * @return {Object} The execution result
   */
  async executeOrder(side, assetOrders, positionId) {
    logger.info(`Executing ${side} order for position ${positionId} with ${assetOrders.length} assets`);
    
    // Track the orders
    const orderId = `binance_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // Simulate order execution
    const results = await Promise.all(assetOrders.map(async (assetOrder) => {
      // Simulate rate limiting
      await this.checkRateLimit();
      
      // Get the order book
      const orderBook = await this.getOrderBook(assetOrder.assetId);
      const bookSide = side === 'buy' ? 'asks' : 'bids';
      
      // Simulate execution with some randomness
      const executionRate = 0.95 + Math.random() * 0.05; // 95-100% fill rate
      const filledQuantity = assetOrder.quantity * executionRate;
      
      // Calculate average execution price with simulated slippage
      const slippageRate = 1 + (side === 'buy' ? 1 : -1) * (Math.random() * 0.01); // 0-1% slippage
      const avgPrice = assetOrder.targetPrice * slippageRate;
      
      // Calculate loss due to slippage
      const idealCost = assetOrder.quantity * assetOrder.targetPrice;
      const actualCost = filledQuantity * avgPrice;
      const loss = side === 'buy' ? actualCost - idealCost : idealCost - actualCost;
      
      return {
        assetId: assetOrder.assetId,
        side,
        targetQuantity: assetOrder.quantity,
        filledQuantity,
        targetPrice: assetOrder.targetPrice,
        avgPrice,
        fill: executionRate * 100,
        loss
      };
    }));
    
    // Calculate overall execution statistics
    const totalTargetQuantity = assetOrders.reduce((sum, order) => sum + order.quantity, 0);
    const totalFilledQuantity = results.reduce((sum, result) => sum + result.filledQuantity, 0);
    const totalLoss = results.reduce((sum, result) => sum + result.loss, 0);
    const overallFillRate = totalFilledQuantity / totalTargetQuantity;
    
    const executionResult = {
      orderId,
      positionId,
      side,
      assets: results,
      totalTargetQuantity,
      totalFilledQuantity,
      overallFillRate: overallFillRate * 100,
      filled: overallFillRate * 100,
      loss: totalLoss,
      timestamp: Date.now()
    };
    
    // Store the executed order
    this.orders.set(orderId, executionResult);
    this.executedOrders.push(executionResult);
    
    logger.info(`Executed ${side} order ${orderId} (fill: ${(overallFillRate * 100).toFixed(2)}%, loss: ${totalLoss.toFixed(2)})`);
    
    return executionResult;
  }

  /**
   * Cancel an order on Binance
   * @param {string} positionId - The position ID to cancel
   * @param {string} orderType - The order type (buy/sell)
   * @return {Object} The cancellation result
   */
  async cancelOrder(positionId, orderType) {
    logger.info(`Cancelling order for position ${positionId}`);
    
    // Simulate rate limiting
    await this.checkRateLimit();
    
    // Find any orders for this position
    const matchingOrders = this.executedOrders.filter(order => order.positionId === positionId);
    
    if (matchingOrders.length === 0) {
      logger.warn(`No orders found for position ${positionId}`);
      return {
        positionId,
        success: false,
        message: 'No orders found for this position',
        fillPercentage: 0,
        loss: 0
      };
    }
    
    // Simulate cancellation with some random fill
    const fillPercentage = Math.random() * 30; // 0-30% filled before cancel
    const loss = Math.random() * 10; // 0-10 loss due to partial execution
    
    const cancelResult = {
      positionId,
      success: true,
      affectedOrders: matchingOrders.map(order => order.orderId),
      fillPercentage,
      loss,
      timestamp: Date.now()
    };
    
    logger.info(`Cancelled order for position ${positionId} (fill: ${fillPercentage.toFixed(2)}%, loss: ${loss.toFixed(2)})`);
    
    return cancelResult;
  }

  /**
   * Check rate limiting and wait if necessary
   * @private
   */
  async checkRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    // Reset counter if 10 seconds have passed
    if (timeSinceLastRequest > 10000) {
      this.requestCount = 0;
      this.lastRequestTime = now;
    }
    
    // Check if we're over the rate limit
    if (this.requestCount >= 100) {
      const waitTime = 10000 - timeSinceLastRequest;
      logger.debug(`Rate limit reached, waiting ${waitTime}ms`);
      await sleep(waitTime);
      this.requestCount = 0;
      this.lastRequestTime = Date.now();
    }
    
    this.requestCount++;
  }

  /**
   * Generate a mock order book for testing
   * @param {string} assetId - The asset identifier
   * @return {Object} A mock order book
   * @private
   */
  generateMockOrderBook(assetId) {
    const basePrice = 10 + Math.random() * 990; // Random price between 10 and 1000
    const bids = [];
    const asks = [];
    
    // Generate 20 levels of bids (buys) at decreasing prices
    for (let i = 0; i < 20; i++) {
      const price = basePrice * (1 - 0.001 * i - Math.random() * 0.001);
      const quantity = 10 + Math.random() * 90; // 10-100 quantity
      bids.push([price.toFixed(8), quantity.toFixed(8)]);
    }
    
    // Generate 20 levels of asks (sells) at increasing prices
    for (let i = 0; i < 20; i++) {
      const price = basePrice * (1 + 0.001 * i + Math.random() * 0.001);
      const quantity = 10 + Math.random() * 90; // 10-100 quantity
      asks.push([price.toFixed(8), quantity.toFixed(8)]);
    }
    
    // Sort bids in descending order (highest price first)
    bids.sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));
    
    // Sort asks in ascending order (lowest price first)
    asks.sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
    
    return {
      assetId,
      bids,
      asks,
      timestamp: Date.now()
    };
  }

  /**
   * Update the order book for an asset (for simulation)
   * @param {string} assetId - The asset identifier
   * @param {number} priceChange - Percentage price change (-10 to +10)
   */
  updateOrderBook(assetId, priceChange) {
    const orderBook = this.orderBooks.get(assetId);
    
    if (!orderBook) {
      return this.generateMockOrderBook(assetId);
    }
    
    // Apply price change to all levels
    const bids = orderBook.bids.map(([price, qty]) => {
      const newPrice = parseFloat(price) * (1 + priceChange / 100);
      return [newPrice.toFixed(8), qty];
    });
    
    const asks = orderBook.asks.map(([price, qty]) => {
      const newPrice = parseFloat(price) * (1 + priceChange / 100);
      return [newPrice.toFixed(8), qty];
    });
    
    // Sort bids in descending order (highest price first)
    bids.sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));
    
    // Sort asks in ascending order (lowest price first)
    asks.sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
    
    this.orderBooks.set(assetId, {
      assetId,
      bids,
      asks,
      timestamp: Date.now()
    });
    
    return this.orderBooks.get(assetId);
  }

  /**
   * Clear all stored data (for testing)
   */
  clear() {
    this.orderBooks.clear();
    this.orders.clear();
    this.executedOrders = [];
    this.requestCount = 0;
    this.lastRequestTime = Date.now();
    
    logger.debug('Binance adapter data cleared');
  }
}

module.exports = BinanceAdapter;
