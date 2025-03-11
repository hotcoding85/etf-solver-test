/**
 * Edge case test scenarios for ETF solver
 */
const Asset = require('../src/models/Asset');
const Index = require('../src/models/Index');
const Order = require('../src/models/Order');

/**
 * Generate an index with extremely uneven weights
 * @return {Index} The uneven index
 */
function generateUnevenWeightIndex() {
  // Create an index with one dominant asset (BTC) and several minor ones
  const assets = [
    new Asset('BTC', 0.02, 40000),  // $800 - 80% of index
    new Asset('ETH', 0.02, 3000),    // $60 - 6% of index
    new Asset('BNB', 0.1, 300),     // $30 - 3% of index
    new Asset('XRP', 20, 0.5),     // $10 - 1% of index
    new Asset('ADA', 5, 2),        // $10 - 1% of index
    new Asset('DOT', 1, 10),       // $10 - 1% of index
    new Asset('SOL', 0.1, 100),    // $10 - 1% of index
    new Asset('DOGE', 20, 0.5),    // $10 - 1% of index
    new Asset('AVAX', 0.2, 50),    // $10 - 1% of index
    new Asset('LINK', 0.5, 20)     // $10 - 1% of index
  ];
  
  return new Index('uneven-weight-index', assets);
}

/**
 * Generate an index with a very large number of assets
 * @param {number} assetCount - Number of assets (default: 100)
 * @return {Index} The large index
 */
function generateLargeIndex(assetCount = 100) {
  const assets = [];
  let totalValue = 0;
  
  // First 10 are well-known assets with realistic values
  const knownAssets = [
    { id: 'BTC', price: 40000, targetValue: 100 },
    { id: 'ETH', price: 3000, targetValue: 100 },
    { id: 'BNB', price: 300, targetValue: 100 },
    { id: 'XRP', price: 0.5, targetValue: 100 },
    { id: 'ADA', price: 2, targetValue: 100 },
    { id: 'DOT', price: 10, targetValue: 100 },
    { id: 'SOL', price: 100, targetValue: 100 },
    { id: 'DOGE', price: 0.5, targetValue: 100 },
    { id: 'AVAX', price: 50, targetValue: 100 },
    { id: 'LINK', price: 20, targetValue: 100 }
  ];
  
  // Add known assets
  for (let i = 0; i < Math.min(assetCount, knownAssets.length); i++) {
    const { id, price, targetValue } = knownAssets[i];
    const quantity = targetValue / price;
    assets.push(new Asset(id, quantity, price));
    totalValue += targetValue;
  }
  
  // Generate remaining random assets if needed
  if (assetCount > knownAssets.length) {
    const remainingCount = assetCount - knownAssets.length;
    const valuePerAsset = 1000 / remainingCount; // Distribute remaining value evenly
    
    for (let i = 0; i < remainingCount; i++) {
      const id = `ASSET-${i + 1}`;
      const price = 1 + Math.random() * 99; // Random price between $1 and $100
      const quantity = valuePerAsset / price;
      
      assets.push(new Asset(id, quantity, price));
      totalValue += valuePerAsset;
    }
  }
  
  return new Index('large-index', assets);
}

/**
 * Generate a high-frequency trading scenario
 * @param {string} indexId - The index ID
 * @return {Array<Order>} Many orders in rapid succession
 */
function generateHighFrequencyOrders(indexId) {
  const orders = [];
  const baseTimestamp = Date.now();
  const count = 50; // Generate 50 orders in rapid succession
  
  // Create various types of orders with timestamps very close to each other
  for (let i = 0; i < count; i++) {
    const timestamp = baseTimestamp + i * 10; // 10ms apart
    const positionId = `hft-${i + 1}`;
    
    // Alternate between buy and sell orders
    if (i % 3 === 0) {
      // Buy order
      orders.push(Order.createBuyOrder(
        positionId,
        indexId,
        0.1 + (Math.random() * 0.2), // Random quantity between 0.1 and 0.3
        1000 * (0.99 + (Math.random() * 0.02)), // Random price around 1000
        timestamp
      ));
    } else if (i % 3 === 1) {
      // Sell order
      orders.push(Order.createSellOrder(
        positionId,
        indexId,
        0.1 + (Math.random() * 0.2), // Random quantity between 0.1 and 0.3
        1000 * (0.99 + (Math.random() * 0.02)), // Random price around 1000
        timestamp
      ));
    } else {
      // Cancel order (cancel a random previous order)
      if (orders.length > 0) {
        const randomIndex = Math.floor(Math.random() * (orders.length - 1));
        const orderToCancel = orders[randomIndex];
        orders.push(Order.createCancelOrder(
          orderToCancel.positionId,
          timestamp
        ));
      } else {
        // If no previous orders, create a buy order instead
        orders.push(Order.createBuyOrder(
          positionId,
          indexId,
          0.1 + (Math.random() * 0.2),
          1000 * (0.99 + (Math.random() * 0.02)),
          timestamp
        ));
      }
    }
  }
  
  // Add a rebalance order in the middle
  orders.push(Order.createRebalanceOrder(
    indexId,
    baseTimestamp + (count / 2) * 10
  ));
  
  return orders;
}

/**
 * Generate a scenario with extreme price changes
 * @param {Index} index - The index to modify
 * @return {Array<{time: number, prices: Object}>} The test scenario
 */
function generateExtremePriceChanges(index) {
  const scenario = [];
  const baseTimestamp = Date.now();
  
  // Define extreme price changes
  const priceScenarios = [
    { time: baseTimestamp, change: 0 },                // Base price
    { time: baseTimestamp + 1000, change: -0.15 },     // 15% drop
    { time: baseTimestamp + 2000, change: 0.25 },      // 25% rise
    { time: baseTimestamp + 3000, change: -0.10 },     // 10% drop
    { time: baseTimestamp + 4000, change: 0.50 },      // 50% rise (extreme)
    { time: baseTimestamp + 5000, change: -0.30 },     // 30% drop (extreme)
    { time: baseTimestamp + 6000, change: 0.10 }       // 10% recovery
  ];
  
  // Apply price changes to assets
  for (const pricePoint of priceScenarios) {
    const timePoint = {
      time: pricePoint.time,
      prices: {}
    };
    
    // Apply price change to each asset with some variation
    for (const asset of index.assets) {
      // Add some random variation per asset
      const assetVariation = 0.8 + (Math.random() * 0.4); // 0.8 to 1.2 multiplier
      const effectiveChange = pricePoint.change * assetVariation;
      
      // Calculate new price
      const newPrice = asset.currentPrice * (1 + effectiveChange);
      timePoint.prices[asset.id] = Math.max(0.0001, newPrice); // Prevent negative prices
    }
    
    scenario.push(timePoint);
  }
  
  return scenario;
}

/**
 * Generate a scenario with no liquidity for some assets
 * @param {Index} index - The index to use
 * @return {Object} Mock order books with no liquidity for some assets
 */
function generateNoLiquidityScenario(index) {
  const scenario = {};
  
  // Select random assets to have no liquidity (25% of all assets)
  const noLiquidityCount = Math.ceil(index.assets.length * 0.25);
  const allAssetIds = index.assets.map(asset => asset.id);
  const noLiquidityAssets = [];
  
  // Randomly select assets to have no liquidity
  while (noLiquidityAssets.length < noLiquidityCount) {
    const randomIndex = Math.floor(Math.random() * allAssetIds.length);
    const assetId = allAssetIds[randomIndex];
    
    if (!noLiquidityAssets.includes(assetId)) {
      noLiquidityAssets.push(assetId);
    }
  }
  
  // Create mock order books
  for (const asset of index.assets) {
    if (noLiquidityAssets.includes(asset.id)) {
      // No liquidity case
      scenario[asset.id] = {
        assetId: asset.id,
        hasLiquidity: false,
        bids: [],
        asks: []
      };
    } else {
      // Normal liquidity
      const currentPrice = asset.currentPrice;
      const bidCount = 5 + Math.floor(Math.random() * 10); // 5-15 bid levels
      const askCount = 5 + Math.floor(Math.random() * 10); // 5-15 ask levels
      
      const bids = [];
      const asks = [];
      
      // Generate bids (buy orders on the book) - below current price
      for (let i = 0; i < bidCount; i++) {
        const priceOffset = 0.005 + (i * 0.002); // 0.5% + incremental steps
        const price = currentPrice * (1 - priceOffset);
        const quantity = 0.1 + (Math.random() * 2); // Random quantity
        
        bids.push({ price, quantity });
      }
      
      // Generate asks (sell orders on the book) - above current price
      for (let i = 0; i < askCount; i++) {
        const priceOffset = 0.005 + (i * 0.002); // 0.5% + incremental steps
        const price = currentPrice * (1 + priceOffset);
        const quantity = 0.1 + (Math.random() * 2); // Random quantity
        
        asks.push({ price, quantity });
      }
      
      // Sort bids descending (highest bid first)
      bids.sort((a, b) => b.price - a.price);
      
      // Sort asks ascending (lowest ask first)
      asks.sort((a, b) => a.price - b.price);
      
      scenario[asset.id] = {
        assetId: asset.id,
        hasLiquidity: true,
        bids,
        asks
      };
    }
  }
  
  return {
    orderBooks: scenario,
    noLiquidityAssets
  };
}

/**
 * Generate a scenario with multiple concurrent rebalances
 * @param {Array<string>} indexIds - The index IDs
 * @return {Array<Order>} Concurrent rebalance orders
 */
function generateConcurrentRebalances(indexIds) {
  const orders = [];
  const baseTimestamp = Date.now();
  
  // Create rebalance orders for all indices at nearly the same time
  for (let i = 0; i < indexIds.length; i++) {
    const timestamp = baseTimestamp + (i * 5); // 5ms apart
    orders.push(Order.createRebalanceOrder(indexIds[i], timestamp));
  }
  
  return orders;
}

module.exports = {
  generateUnevenWeightIndex,
  generateLargeIndex,
  generateHighFrequencyOrders,
  generateExtremePriceChanges,
  generateNoLiquidityScenario,
  generateConcurrentRebalances
};