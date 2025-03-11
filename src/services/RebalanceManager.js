const logger = require('../utils/logger');
const Asset = require('../models/Asset');

class RebalanceManager {
  constructor() {
    this.rebalanceHistory = [];
  }

  async createRebalancePlan(index, binanceAdapter) {
    logger.info(`Creating rebalance plan for index ${index.id}`);
    
    // Get current prices for all assets
    await this.updateAssetPrices(index, binanceAdapter);
    
    const currentPrice = index.getCurrentPrice();
    const currentAssets = index.assets.map(asset => asset.toObject());
    
    // Simulate rebalance by generating updated weights
    // In a real implementation, this would come from the ETF manager
    const newAssets = this.generateRebalanceAssets(index);
    
    // Calculate changes for each asset
    const assetChanges = this.calculateAssetChanges(currentAssets, newAssets);
    
    // Calculate estimated costs
    const estimatedCosts = await this.estimateRebalanceCosts(assetChanges, binanceAdapter);
    
    return {
      indexId: index.id,
      timestamp: Date.now(),
      currentPrice,
      currentAssets,
      newAssets,
      assetChanges,
      estimatedCosts
    };
  }

  async executeRebalance(index, rebalancePlan, binanceAdapter) {
    logger.info(`Executing rebalance for index ${index.id}`);
    
    const { assetChanges } = rebalancePlan;
    
    // Group assets by buy/sell to batch operations
    const buys = assetChanges.filter(change => change.changeQuantity > 0);
    const sells = assetChanges.filter(change => change.changeQuantity < 0);
    
    // Execute sells first to free up capital
    let totalLoss = 0;
    const executionResults = [];
    
    if (sells.length > 0) {
      const sellOrders = sells.map(sell => ({
        assetId: sell.assetId,
        quantity: Math.abs(sell.changeQuantity),
        targetPrice: sell.newPrice,
        side: 'sell'
      }));
      
      const sellResult = await binanceAdapter.executeOrder(
        'sell',
        sellOrders,
        `rebalance_${index.id}_sell_${Date.now()}`
      );
      
      totalLoss += sellResult.loss;
      executionResults.push(sellResult);
    }
    
    // Then execute buys
    if (buys.length > 0) {
      const buyOrders = buys.map(buy => ({
        assetId: buy.assetId,
        quantity: buy.changeQuantity,
        targetPrice: buy.newPrice,
        side: 'buy'
      }));
      
      const buyResult = await binanceAdapter.executeOrder(
        'buy',
        buyOrders,
        `rebalance_${index.id}_buy_${Date.now()}`
      );
      
      totalLoss += buyResult.loss;
      executionResults.push(buyResult);
    }
    
    // Update the index with new assets
    const newAssetsObjects = rebalancePlan.newAssets.map(assetData => {
      return new Asset(
        assetData.id,
        assetData.quantity,
        assetData.price,
        assetData.price
      );
    });
    
    const rebalanceReport = index.rebalance(newAssetsObjects);
    
    // Record the rebalance in history
    const rebalanceResult = {
      indexId: index.id,
      timestamp: Date.now(),
      totalLoss,
      executionResults,
      rebalanceReport
    };
    
    this.rebalanceHistory.push(rebalanceResult);
    
    logger.info(`Rebalance executed for index ${index.id} (loss: ${totalLoss.toFixed(2)})`);
    
    return rebalanceResult;
  }

  /**
   * Update asset prices from market data
   * @param {Index} index - The index to update
   * @param {Object} binanceAdapter - The Binance API adapter
   * @private
   */
  async updateAssetPrices(index, binanceAdapter) {
    logger.debug(`Updating asset prices for index ${index.id}`);
    
    await Promise.all(index.assets.map(async (asset) => {
      // In a real implementation, we would get the current price from the market
      // Here we're using the mock order book for simulation
      const orderBook = await binanceAdapter.getOrderBook(asset.id);
      
      // Use the mid price from the order book
      const bestBid = parseFloat(orderBook.bids[0][0]);
      const bestAsk = parseFloat(orderBook.asks[0][0]);
      const midPrice = (bestBid + bestAsk) / 2;
      
      asset.updatePrice(midPrice);
    }));
  }

  /**
   * Generate rebalanced assets for simulation
   * @param {Index} index - The index to rebalance
   * @return {Array<Object>} The rebalanced assets
   * @private
   */
  generateRebalanceAssets(index) {
    const currentAssets = index.assets;
    const currentPrice = index.getCurrentPrice();
    
    // In a real implementation, this would come from the ETF manager
    // Here we're simulating by:
    // 1. Keeping 70% of existing assets
    // 2. Adjusting quantities by ±20%
    // 3. Potentially adding or removing assets
    
    // Start with existing assets and adjust quantities
    const adjustedAssets = currentAssets.map(asset => {
      // Random adjustment between -20% and +20%
      const adjustmentFactor = 0.8 + Math.random() * 0.4;
      const newQuantity = asset.quantity * adjustmentFactor;
      
      return {
        id: asset.id,
        quantity: newQuantity,
        price: asset.currentPrice,
        initialPrice: asset.currentPrice,
        currentPrice: asset.currentPrice
      };
    });
    
    // Randomly decide if we should remove some assets
    const assetsToKeep = [];
    const assetsToRemove = [];
    
    for (const asset of adjustedAssets) {
      if (Math.random() > 0.7) {
        assetsToRemove.push(asset);
      } else {
        assetsToKeep.push(asset);
      }
    }
    
    // Generate some new assets to add
    const newAssetCount = Math.floor(Math.random() * 3); // 0-2 new assets
    const newAssets = [];
    
    for (let i = 0; i < newAssetCount; i++) {
      const assetId = `NEW_ASSET_${Date.now()}_${i}`;
      const price = 10 + Math.random() * 990; // Random price between 10 and 1000
      const quantity = 1 + Math.random() * 9; // Random quantity between 1 and 10
      
      newAssets.push({
        id: assetId,
        quantity,
        price,
        initialPrice: price,
        currentPrice: price
      });
    }
    
    // Combine kept assets and new assets
    const finalAssets = [...assetsToKeep, ...newAssets];
    
    // Ensure the rebalanced index has a similar total value
    const newTotalValue = finalAssets.reduce((total, asset) => 
      total + asset.quantity * asset.price, 0);
    
    // Scale quantities to maintain approximately the same index value
    const scaleFactor = currentPrice / newTotalValue;
    
    for (const asset of finalAssets) {
      asset.quantity *= scaleFactor;
    }
    
    return finalAssets;
  }

  /**
   * Calculate asset changes for rebalancing
   * @param {Array<Object>} currentAssets - Current assets
   * @param {Array<Object>} newAssets - New assets after rebalance
   * @return {Array<Object>} Asset changes
   * @private
   */
  calculateAssetChanges(currentAssets, newAssets) {
    // Create maps for easier lookup
    const currentMap = new Map(currentAssets.map(asset => [asset.id, asset]));
    const newMap = new Map(newAssets.map(asset => [asset.id, asset]));
    
    const allAssetIds = new Set([
      ...currentMap.keys(),
      ...newMap.keys()
    ]);
    
    // Calculate changes for each asset
    const changes = [];
    
    for (const assetId of allAssetIds) {
      const currentAsset = currentMap.get(assetId);
      const newAsset = newMap.get(assetId);
      
      // Asset is being removed
      if (currentAsset && !newAsset) {
        changes.push({
          assetId,
          action: 'remove',
          oldQuantity: currentAsset.quantity,
          newQuantity: 0,
          changeQuantity: -currentAsset.quantity,
          oldPrice: currentAsset.currentPrice,
          newPrice: currentAsset.currentPrice,
          valueDifference: -currentAsset.quantity * currentAsset.currentPrice
        });
      }
      // Asset is being added
      else if (!currentAsset && newAsset) {
        changes.push({
          assetId,
          action: 'add',
          oldQuantity: 0,
          newQuantity: newAsset.quantity,
          changeQuantity: newAsset.quantity,
          oldPrice: newAsset.price,
          newPrice: newAsset.price,
          valueDifference: newAsset.quantity * newAsset.price
        });
      }
      // Asset quantity is changing
      else if (currentAsset && newAsset) {
        const qtyDifference = newAsset.quantity - currentAsset.quantity;
        
        changes.push({
          assetId,
          action: qtyDifference > 0 ? 'increase' : qtyDifference < 0 ? 'decrease' : 'unchanged',
          oldQuantity: currentAsset.quantity,
          newQuantity: newAsset.quantity,
          changeQuantity: qtyDifference,
          oldPrice: currentAsset.currentPrice,
          newPrice: newAsset.price,
          valueDifference: (newAsset.quantity * newAsset.price) - 
                           (currentAsset.quantity * currentAsset.currentPrice)
        });
      }
    }
    
    return changes;
  }

  /**
   * Estimate costs for rebalancing
   * @param {Array<Object>} assetChanges - Asset changes
   * @param {Object} binanceAdapter - The Binance API adapter
   * @return {Object} Estimated costs
   * @private
   */
  async estimateRebalanceCosts(assetChanges, binanceAdapter) {
    // Group by buy/sell
    const buys = assetChanges.filter(change => change.changeQuantity > 0);
    const sells = assetChanges.filter(change => change.changeQuantity < 0);
    
    // Estimate costs for buys
    const buyEstimates = await Promise.all(buys.map(async (buy) => {
      // Get order book to estimate slippage
      const orderBook = await binanceAdapter.getOrderBook(buy.assetId);
      
      // Simple slippage estimation based on order book
      const estimatedSlippage = 0.001 + Math.random() * 0.005; // 0.1-0.6% slippage
      const estimatedCost = buy.changeQuantity * buy.newPrice * estimatedSlippage;
      
      return {
        assetId: buy.assetId,
        action: 'buy',
        quantity: buy.changeQuantity,
        price: buy.newPrice,
        notional: buy.changeQuantity * buy.newPrice,
        estimatedSlippage,
        estimatedCost
      };
    }));
    
    // Estimate costs for sells
    const sellEstimates = await Promise.all(sells.map(async (sell) => {
      // Get order book to estimate slippage
      const orderBook = await binanceAdapter.getOrderBook(sell.assetId);
      
      // Simple slippage estimation based on order book
      const estimatedSlippage = 0.001 + Math.random() * 0.005; // 0.1-0.6% slippage
      const estimatedCost = Math.abs(sell.changeQuantity) * sell.newPrice * estimatedSlippage;
      
      return {
        assetId: sell.assetId,
        action: 'sell',
        quantity: Math.abs(sell.changeQuantity),
        price: sell.newPrice,
        notional: Math.abs(sell.changeQuantity) * sell.newPrice,
        estimatedSlippage,
        estimatedCost
      };
    }));
    
    // Calculate totals
    const totalBuyNotional = buyEstimates.reduce((sum, est) => sum + est.notional, 0);
    const totalSellNotional = sellEstimates.reduce((sum, est) => sum + est.notional, 0);
    const totalBuyCost = buyEstimates.reduce((sum, est) => sum + est.estimatedCost, 0);
    const totalSellCost = sellEstimates.reduce((sum, est) => sum + est.estimatedCost, 0);
    const totalCost = totalBuyCost + totalSellCost;
    
    return {
      buyEstimates,
      sellEstimates,
      totalBuyNotional,
      totalSellNotional,
      totalBuyCost,
      totalSellCost,
      totalCost
    };
  }

  /**
   * Get rebalance history for an index
   * @param {string} indexId - The index ID
   * @return {Array<Object>} Rebalance history
   */
  getRebalanceHistory(indexId) {
    return this.rebalanceHistory.filter(record => record.indexId === indexId);
  }

  /**
   * Clear rebalance history
   */
  clearHistory() {
    this.rebalanceHistory = [];
    logger.debug('Rebalance history cleared');
  }
}

module.exports = RebalanceManager;
