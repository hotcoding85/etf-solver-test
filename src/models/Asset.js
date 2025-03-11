/**
 * Asset model representing a single asset in an index
 */
class Asset {
  /**
   * Create a new asset
   * @param {string} id - The asset identifier (e.g., BTC, ETH)
   * @param {number} quantity - The quantity of the asset in the index
   * @param {number} initialPrice - The price at last rebalance
   * @param {number} currentPrice - The current price of the asset
   */
  constructor(id, quantity, initialPrice, currentPrice = initialPrice) {
    this.id = id;
    this.quantity = quantity;
    this.initialPrice = initialPrice;
    this.currentPrice = currentPrice;
  }

  /**
   * Get the total value of this asset
   * @return {number} The total value (quantity * currentPrice)
   */
  getValue() {
    return this.quantity * this.currentPrice;
  }

  /**
   * Get the total value at initial price
   * @return {number} The initial value (quantity * initialPrice)
   */
  getInitialValue() {
    return this.quantity * this.initialPrice;
  }

  /**
   * Update the current price of the asset
   * @param {number} newPrice - The new current price
   */
  updatePrice(newPrice) {
    this.currentPrice = newPrice;
  }

  /**
   * Update the asset during rebalance
   * @param {number} newQuantity - The new quantity after rebalance
   * @param {number} newPrice - The new price at rebalance time
   */
  rebalance(newQuantity, newPrice) {
    this.quantity = newQuantity;
    this.initialPrice = newPrice;
    this.currentPrice = newPrice;
  }

  /**
   * Create a deep copy of this asset
   * @return {Asset} A new asset instance with the same properties
   */
  clone() {
    return new Asset(this.id, this.quantity, this.initialPrice, this.currentPrice);
  }

  /**
   * Create an asset from a serialized object
   * @param {Object} data - The serialized asset data
   * @return {Asset} A new asset instance
   */
  static fromObject(data) {
    return new Asset(data.id, data.quantity, data.initialPrice, data.currentPrice);
  }

  /**
   * Convert the asset to a simple object for serialization
   * @return {Object} A plain object representation of the asset
   */
  toObject() {
    return {
      id: this.id,
      quantity: this.quantity,
      initialPrice: this.initialPrice,
      currentPrice: this.currentPrice
    };
  }
}

module.exports = Asset;
