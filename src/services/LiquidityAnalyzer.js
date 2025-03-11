const logger = require('../utils/logger');
const { MIN_ASSET_PURCHASE } = require('../utils/constants');

/**
 * Analyzes market liquidity for optimal order execution
 */
class LiquidityAnalyzer {
  constructor() {
    this.orderBookCache = new Map(); // Cache order book data to reduce API calls
    this.orderBookCacheTTL = 5000; // 5 seconds TTL for order book cache
  }

  /**
   * Prioritize orders based on available liquidity
   * @param {Array<{order: Order, type: string}>} orders - List of orders to prioritize
   * @param {Map<string, Index>} indices - Map of indices by ID
   * @param {number} limit - Maximum number of orders to return
   * @return {Array<{order: Order, type: string}>} Prioritized orders
   */
  async prioritizeOrders(orders, indices, limit) {
    if (orders.length === 0) return [];
    
    // Start with getting index data for all orders
    const ordersWithData = await Promise.all(orders.map(async (orderData) => {
      const { order, type } = orderData;
      const index = indices.get(order.indexId);
      
      if (!index) {
        logger.warn(`Index ${order.indexId} not found for order ${order.id}`);
        return { ...orderData, fillable: 0, notional: 0 };
      }
      
      // Quick liquidity analysis
      try {
        const liquidityInfo = await this.quickLiquidityCheck(order, index);
        
        return {
          ...orderData,
          index,
          fillable: liquidityInfo.fillablePercent,
          notional: order.quantity * order.indexPrice * (liquidityInfo.fillablePercent / 100),
          worstAsset: liquidityInfo.worstAsset
        };
      } catch (error) {
        logger.error(`Error analyzing liquidity for order ${order.id}: ${error.message}`);
        return { ...orderData, fillable: 0, notional: 0 };
      }
    }));
    
    // Sort by fillable percentage and notional value
    const prioritized = ordersWithData
      .filter(o => o.fillable > 0) // Only consider orders with some liquidity
      .sort((a, b) => {
        // First sort by fillable percentage in descending order
        if (b.fillable !== a.fillable) {
          return b.fillable - a.fillable;
        }
        
        // If fillable percentages are equal, sort by notional value
        return b.notional - a.notional;
      })
      .slice(0, limit);
    
    logger.info(`Prioritized ${prioritized.length} orders out of ${orders.length}`);
    return prioritized;
  }

  /**
   * Perform a quick liquidity check without full order book analysis
   * @param {Order} order - The order to check
   * @param {Index} index - The index for this order
   * @return {Object} Quick liquidity assessment
   */
  async quickLiquidityCheck(order, index) {
    const currentPrice = index.getCurrentPrice();
    
    // For now, a simple check based on order type and price
    if (order.type === 'buy' && order.indexPrice < currentPrice) {
      return { fillablePercent: 0 };
    }
    
    if (order.type === 'sell' && order.indexPrice > currentPrice) {
      return { fillablePercent: 0 };
    }
    
    // Perform a rough estimate based on the worst asset's liquidity
    const assetLiquidities = await Promise.all(index.assets.map(async (asset) => {
      // Calculate notional value for this asset
      const assetNotional = (asset.getValue() / currentPrice) * order.quantity * order.indexPrice;
      
      if (assetNotional < MIN_ASSET_PURCHASE) {
        // Skip tiny purchases that would be rounded to zero
        return { asset: asset.id, fillablePercent: 100 };
      }
      
      // Get rough liquidity estimate
      const liquidity = await this.getAssetLiquidity(asset.id, assetNotional, order.type);
      return {
        asset: asset.id,
        fillablePercent: liquidity.fillablePercent
      };
    }));
    
    // Find the asset with the worst fillable percentage
    const worstAsset = assetLiquidities.reduce((worst, current) => {
      return current.fillablePercent < worst.fillablePercent ? current : worst;
    }, { fillablePercent: 100 });
    
    return {
      fillablePercent: worstAsset.fillablePercent,
      worstAsset: worstAsset.asset
    };
  }

  /**
   * Get rough liquidity estimate for an asset
   * @param {string} assetId - The asset ID
   * @param {number} notional - The notional value to fill
   * @param {string} orderType - The order type (buy/sell)
   * @return {Object} Liquidity estimate
   */
  async getAssetLiquidity(assetId, notional, orderType) {
    // In a real implementation, this would check actual order book data
    // Here we're just returning a random value for simulation
    const fillablePercent = Math.min(100, Math.random() * 100 + 50);
    
    return {
      fillablePercent,
      estimatedSlippage: (100 - fillablePercent) * 0.01
    };
  }

  /**
   * Analyze the liquidity for an order to determine how much can be filled
   * @param {Order} order - The order to analyze
   * @param {Index} index - The index for this order
   * @param {Object} binanceAdapter - The Binance API adapter
   * @param {string} side - The order side (buy/sell)
   * @return {Object} Detailed liquidity analysis
   */
  async analyzeOrderLiquidity(order, index, binanceAdapter, side = order.type) {
    const currentPrice = index.getCurrentPrice();
    const targetPrice = order.indexPrice;
    const quantity = order.quantity;
    
    logger.info(`Analyzing liquidity for ${side} order ${order.id} (index: ${index.id}, qty: ${quantity}, price: ${targetPrice})`);
    
    // For each asset in the index, analyze how much can be filled
    const assetAnalysis = await Promise.all(index.assets.map(async (asset) => {
      // Calculate the notional value and quantity for this asset
      const assetWeight = asset.getValue() / currentPrice;
      const assetNotional = assetWeight * quantity * targetPrice;
      const assetTargetQty = assetNotional / asset.currentPrice;
      
      if (assetNotional < MIN_ASSET_PURCHASE) {
        // Skip assets with tiny notional values
        return {
          assetId: asset.id,
          notional: 0,
          quantity: 0,
          fillablePercent: 100,
          skip: true,
          reason: 'Below minimum purchase'
        };
      }
      
      // Get the order book for this asset
      const orderBook = await binanceAdapter.getOrderBook(asset.id);
      
      // Analyze the order book to determine fillable quantity
      const bookSide = side === 'sell' ? 'bids' : 'asks';
      
      let fillableQty = 0;
      let costBasis = 0;
      
      for (const [price, qty] of orderBook[bookSide]) {
        const priceValue = parseFloat(price);
        const qtyValue = parseFloat(qty);
        
        // Check if this level would exceed our target
        if (fillableQty + qtyValue >= assetTargetQty) {
          const remainingQty = assetTargetQty - fillableQty;
          fillableQty += remainingQty;
          costBasis += remainingQty * priceValue;
          break;
        }
        
        fillableQty += qtyValue;
        costBasis += qtyValue * priceValue;
        
        if (fillableQty >= assetTargetQty) {
          break;
        }
      }
      
      const fillablePercent = (fillableQty / assetTargetQty) * 100;
      const avgPrice = fillableQty > 0 ? costBasis / fillableQty : 0;
      const slippage = side === 'buy' 
        ? (avgPrice - asset.currentPrice) / asset.currentPrice * 100 
        : (asset.currentPrice - avgPrice) / asset.currentPrice * 100;
      
      return {
        assetId: asset.id,
        currentPrice: asset.currentPrice,
        targetPrice: asset.currentPrice,
        notional: assetNotional,
        targetQuantity: assetTargetQty,
        fillableQuantity: fillableQty,
        fillablePercent,
        averagePrice: avgPrice,
        slippage,
        costBasis
      };
    }));
    
    // Find the asset with the lowest fillable percentage
    const worstAsset = assetAnalysis.reduce((worst, current) => {
      if (current.skip) return worst;
      return current.fillablePercent < worst.fillablePercent ? current : worst;
    }, { fillablePercent: 100 });
    
    // Calculate the overall fillable percentage based on the worst asset
    const overallFillablePercent = Math.min(100, worstAsset.fillablePercent);
    
    // Adjust all assets to match the worst fillable percentage
    const assetOrders = assetAnalysis.map(asset => {
      if (asset.skip) return null;
      
      const adjustedQuantity = asset.targetQuantity * (overallFillablePercent / 100);
      
      return {
        assetId: asset.id,
        quantity: adjustedQuantity,
        targetPrice: asset.currentPrice,
        side
      };
    }).filter(Boolean);
    
    logger.info(`Liquidity analysis for order ${order.id}: ${overallFillablePercent.toFixed(2)}% fillable`);
    
    return {
      orderId: order.id,
      indexId: index.id,
      side,
      targetQuantity: quantity,
      fillableQuantity: quantity * (overallFillablePercent / 100),
      fillablePercent: overallFillablePercent,
      worstAsset: worstAsset.assetId,
      assetAnalysis,
      assetOrders
    };
  }

  /**
   * Clear the order book cache
   */
  clearCache() {
    this.orderBookCache.clear();
    logger.debug('Order book cache cleared');
  }
}

module.exports = LiquidityAnalyzer;
