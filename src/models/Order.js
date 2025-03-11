/**
 * Order model representing a trading order (buy/sell/cancel/rebalance)
 */
class Order {
  /**
   * Create a new order
   * @param {string} type - The order type ('buy', 'sell', 'cancel', 'rebalance')
   * @param {string} positionId - The position ID for this order
   * @param {string} indexId - The index ID this order is for (null for cancel)
   * @param {number} quantity - The quantity to buy/sell (null for cancel/rebalance)
   * @param {number} indexPrice - The target price for the index (null for cancel/rebalance)
   * @param {number} timestamp - The timestamp when this order was created
   */
  constructor(type, positionId, indexId = null, quantity = null, indexPrice = null, timestamp = Date.now()) {
    this.id = `order_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.type = type;
    this.positionId = positionId;
    this.indexId = indexId;
    this.quantity = quantity;
    this.indexPrice = indexPrice;
    this.timestamp = timestamp;
    this.status = 'pending'; // pending, processing, filled, partially_filled, canceled, failed
    this.fillPercentage = 0;
    this.loss = 0;
    this.executionDetails = [];
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  /**
   * Update the order status
   * @param {string} status - The new status
   * @param {Object} details - Additional details about the status change
   */
  updateStatus(status, details = {}) {
    this.status = status;
    this.updatedAt = Date.now();
    
    if (details.fillPercentage !== undefined) {
      this.fillPercentage = details.fillPercentage;
    }
    
    if (details.loss !== undefined) {
      this.loss = details.loss;
    }
    
    if (details.execution) {
      this.executionDetails.push({
        ...details.execution,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Check if this is a buy order
   * @return {boolean} True if this is a buy order
   */
  isBuy() {
    return this.type === 'buy';
  }

  /**
   * Check if this is a sell order
   * @return {boolean} True if this is a sell order
   */
  isSell() {
    return this.type === 'sell';
  }

  /**
   * Check if this is a cancel order
   * @return {boolean} True if this is a cancel order
   */
  isCancel() {
    return this.type === 'cancel';
  }

  /**
   * Check if this is a rebalance order
   * @return {boolean} True if this is a rebalance order
   */
  isRebalance() {
    return this.type === 'rebalance';
  }

  /**
   * Check if the order is active (pending or processing)
   * @return {boolean} True if the order is active
   */
  isActive() {
    return this.status === 'pending' || this.status === 'processing';
  }

  /**
   * Check if the order is complete (filled, canceled, or failed)
   * @return {boolean} True if the order is complete
   */
  isComplete() {
    return this.status === 'filled' || this.status === 'canceled' || this.status === 'failed';
  }

  /**
   * Create an order from a serialized object
   * @param {Object} data - The serialized order data
   * @return {Order} A new order instance
   */
  static fromObject(data) {
    const order = new Order(
      data.type,
      data.positionId,
      data.indexId,
      data.quantity,
      data.indexPrice,
      data.timestamp
    );
    
    order.id = data.id;
    order.status = data.status;
    order.fillPercentage = data.fillPercentage;
    order.loss = data.loss;
    order.executionDetails = data.executionDetails || [];
    order.createdAt = data.createdAt;
    order.updatedAt = data.updatedAt;
    
    return order;
  }

  /**
   * Convert the order to a simple object for serialization
   * @return {Object} A plain object representation of the order
   */
  toObject() {
    return {
      id: this.id,
      type: this.type,
      positionId: this.positionId,
      indexId: this.indexId,
      quantity: this.quantity,
      indexPrice: this.indexPrice,
      timestamp: this.timestamp,
      status: this.status,
      fillPercentage: this.fillPercentage,
      loss: this.loss,
      executionDetails: this.executionDetails,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * Create a buy order
   * @param {string} positionId - The position ID
   * @param {string} indexId - The index ID
   * @param {number} quantity - The quantity to buy
   * @param {number} indexPrice - The target price for the index
   * @param {number} timestamp - The timestamp
   * @return {Order} A new buy order
   */
  static createBuyOrder(positionId, indexId, quantity, indexPrice, timestamp = Date.now()) {
    return new Order('buy', positionId, indexId, quantity, indexPrice, timestamp);
  }

  /**
   * Create a sell order
   * @param {string} positionId - The position ID
   * @param {string} indexId - The index ID
   * @param {number} quantity - The quantity to sell
   * @param {number} indexPrice - The target price for the index
   * @param {number} timestamp - The timestamp
   * @return {Order} A new sell order
   */
  static createSellOrder(positionId, indexId, quantity, indexPrice, timestamp = Date.now()) {
    return new Order('sell', positionId, indexId, quantity, indexPrice, timestamp);
  }

  /**
   * Create a cancel order
   * @param {string} positionId - The position ID to cancel
   * @param {number} timestamp - The timestamp
   * @return {Order} A new cancel order
   */
  static createCancelOrder(positionId, timestamp = Date.now()) {
    return new Order('cancel', positionId, null, null, null, timestamp);
  }

  /**
   * Create a rebalance order
   * @param {string} indexId - The index ID to rebalance
   * @param {number} timestamp - The timestamp
   * @return {Order} A new rebalance order
   */
  static createRebalanceOrder(indexId, timestamp = Date.now()) {
    return new Order('rebalance', `rebalance_${indexId}_${Date.now()}`, indexId, null, null, timestamp);
  }
}

module.exports = Order;
