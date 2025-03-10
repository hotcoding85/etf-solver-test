const Asset = require('./Asset');

/**
 * Index model representing an ETF index with multiple assets
 */
class Index {
  /**
   * Create a new index
   * @param {string} id - The index identifier
   * @param {Array<Asset>} assets - The assets composing the index
   */
  constructor(id, assets = []) {
    this.id = id;
    this.assets = assets;
    this.createdAt = Date.now();
    this.lastRebalance = Date.now();
  }

  /**
   * Add an asset to the index
   * @param {Asset} asset - The asset to add
   */
  addAsset(asset) {
    this.assets.push(asset);
  }

  /**
   * Remove an asset from the index by id
   * @param {string} assetId - The id of the asset to remove
   * @return {boolean} Whether the asset was found and removed
   */
  removeAsset(assetId) {
    const initialLength = this.assets.length;
    this.assets = this.assets.filter(asset => asset.id !== assetId);
    return initialLength !== this.assets.length;
  }

  /**
   * Get an asset by id
   * @param {string} assetId - The id of the asset to retrieve
   * @return {Asset|null} The asset if found, null otherwise
   */
  getAsset(assetId) {
    return this.assets.find(asset => asset.id === assetId) || null;
  }

  /**
   * Calculate the current index price
   * @return {number} The current index price (sum of all asset values)
   */
  getCurrentPrice() {
    return this.assets.reduce((total, asset) => total + asset.getValue(), 0);
  }

  /**
   * Calculate the index price at last rebalance
   * @return {number} The index price at last rebalance
   */
  getInitialPrice() {
    return this.assets.reduce((total, asset) => total + asset.getInitialValue(), 0);
  }

  /**
   * Update the price of an asset in the index
   * @param {string} assetId - The id of the asset to update
   * @param {number} newPrice - The new price for the asset
   * @return {boolean} Whether the asset was found and updated
   */
  updateAssetPrice(assetId, newPrice) {
    const asset = this.getAsset(assetId);
    if (!asset) return false;
    
    asset.updatePrice(newPrice);
    return true;
  }

  /**
   * Perform a rebalance of the index
   * @param {Array<Asset>} newAssets - The new composition of assets after rebalance
   * @return {Object} Report on the rebalance costs and changes
   */
  rebalance(newAssets) {
    const oldPrice = this.getCurrentPrice();
    const oldAssets = [...this.assets];
    
    // Create map of new assets by ID for easier lookup
    const newAssetsMap = newAssets.reduce((map, asset) => {
      map[asset.id] = asset;
      return map;
    }, {});
    
    // Calculate changes needed
    const addedAssets = newAssets.filter(asset => 
      !this.assets.some(oldAsset => oldAsset.id === asset.id)
    );
    
    const removedAssets = this.assets.filter(oldAsset => 
      !newAssets.some(asset => asset.id === oldAsset.id)
    );
    
    const changedAssets = newAssets.filter(asset => {
      const oldAsset = this.getAsset(asset.id);
      return oldAsset && (oldAsset.quantity !== asset.quantity);
    });
    
    // Update the index with new assets
    this.assets = newAssets.map(asset => new Asset(
      asset.id,
      asset.quantity,
      asset.currentPrice,
      asset.currentPrice
    ));
    
    const newPrice = this.getCurrentPrice();
    this.lastRebalance = Date.now();
    
    return {
      oldPrice,
      newPrice,
      priceDifference: newPrice - oldPrice,
      addedAssets: addedAssets.map(a => a.toObject()),
      removedAssets: removedAssets.map(a => a.toObject()),
      changedAssets: changedAssets.map(a => {
        const oldAsset = oldAssets.find(oa => oa.id === a.id);
        return {
          asset: a.toObject(),
          oldQuantity: oldAsset ? oldAsset.quantity : 0,
          newQuantity: a.quantity,
          change: a.quantity - (oldAsset ? oldAsset.quantity : 0)
        };
      }),
      timestamp: this.lastRebalance
    };
  }

  /**
   * Clone the index
   * @return {Index} A new index instance with cloned assets
   */
  clone() {
    return new Index(
      this.id,
      this.assets.map(asset => asset.clone())
    );
  }

  /**
   * Create an index from a serialized object
   * @param {Object} data - The serialized index data
   * @return {Index} A new index instance
   */
  static fromObject(data) {
    const assets = data.assets.map(assetData => Asset.fromObject(assetData));
    const index = new Index(data.id, assets);
    index.createdAt = data.createdAt || Date.now();
    index.lastRebalance = data.lastRebalance || Date.now();
    return index;
  }

  /**
   * Convert the index to a simple object for serialization
   * @return {Object} A plain object representation of the index
   */
  toObject() {
    return {
      id: this.id,
      assets: this.assets.map(asset => asset.toObject()),
      createdAt: this.createdAt,
      lastRebalance: this.lastRebalance,
      currentPrice: this.getCurrentPrice(),
      initialPrice: this.getInitialPrice()
    };
  }
}

module.exports = Index;
