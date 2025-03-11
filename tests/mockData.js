/**
 * Mock data for testing the ETF solver
 */
const Asset = require('../src/models/Asset');
const Index = require('../src/models/Index');
const Order = require('../src/models/Order');

/**
 * Generate a sample index with random assets
 * @param {string} id - The index ID
 * @param {number} assetCount - Number of assets to include
 * @return {Index} The generated index
 */
function generateSampleIndex(id = 'sample-index', assetCount = 10) {
  const assets = [];
  
  // Generate some common crypto assets
  const assetNames = ['BTC', 'ETH', 'BNB', 'XRP', 'ADA', 'DOT', 'SOL', 'DOGE', 'AVAX', 'MATIC', 'LINK', 'ATOM'];
  
  for (let i = 0; i < Math.min(assetCount, assetNames.length); i++) {
    // Generate prices in a reasonable range for each asset
    let price;
    switch (assetNames[i]) {
      case 'BTC':
        price = 35000 + Math.random() * 10000; // $35,000-$45,000
        break;
      case 'ETH':
        price = 2000 + Math.random() * 1000;   // $2,000-$3,000
        break;
      case 'BNB':
        price = 300 + Math.random() * 100;     // $300-$400
        break;
      default:
        price = 1 + Math.random() * 99;        // $1-$100
    }
    
    // Generate a reasonable quantity to keep the index at around 1000 price
    const targetContribution = 1000 / assetCount;
    const quantity = targetContribution / price;
    
    assets.push(new Asset(assetNames[i], quantity, price));
  }
  
  // If we need more assets than we have names for, generate random ones
  if (assetCount > assetNames.length) {
    for (let i = assetNames.length; i < assetCount; i++) {
      const assetId = `ASSET-${i+1}`;
      const price = 1 + Math.random() * 99;  // $1-$100
      const quantity = (1000 / assetCount) / price;
      
      assets.push(new Asset(assetId, quantity, price));
    }
  }
  
  return new Index(id, assets);
}

/**
 * Generate a predefined index with specific assets
 * @return {Index} The predefined index
 */
function generatePredefinedIndex() {
  const assets = [
    new Asset('BTC', 0.01, 40000),  // $400
    new Asset('ETH', 0.1, 3000),    // $300
    new Asset('BNB', 0.5, 300),     // $150
    new Asset('XRP', 100, 0.5),     // $50
    new Asset('ADA', 50, 2),        // $100
  ];
  
  return new Index('predefined-index', assets);
}

/**
 * Generate a sequence of test orders
 * @param {string} indexId - The index ID
 * @return {Array<Order>} The test orders
 */
function generateTestOrders(indexId) {
  const timestamp = Date.now();
  const orders = [];
  
  // Buy orders
  orders.push(Order.createBuyOrder('position-1', indexId, 1, 1000, timestamp));
  orders.push(Order.createBuyOrder('position-2', indexId, 2, 990, timestamp + 1000));
  
  // Sell orders
  orders.push(Order.createSellOrder('position-3', indexId, 0.5, 1020, timestamp + 2000));
  
  // Cancel order
  orders.push(Order.createCancelOrder('position-1', timestamp + 3000));
  
  // Rebalance order
  orders.push(Order.createRebalanceOrder(indexId, timestamp + 4000));
  
  return orders;
}

/**
 * Generate a test scenario with price changes
 * @param {Index} index - The index to modify
 * @return {Array<{time: number, prices: Object}>} The test scenario
 */
function generatePriceChangesScenario(index) {
  const scenario = [];
  const timestamp = Date.now();
  
  // Create a price change scenario with 5 time points
  const priceChanges = [
    { time: timestamp, change: 0 },              // Base prices
    { time: timestamp + 10000, change: -0.05 },  // 5% drop
    { time: timestamp + 20000, change: 0.08 },   // 8% rise
    { time: timestamp + 30000, change: 0.02 },   // 2% rise
    { time: timestamp + 40000, change: -0.03 }   // 3% drop
  ];
  
  // Apply price changes to each asset
  priceChanges.forEach(changePoint => {
    const pricePoint = {
      time: changePoint.time,
      prices: {}
    };
    
    index.assets.forEach(asset => {
      // Calculate new price with some random variation per asset
      const variation = 0.97 + Math.random() * 0.06; // ±3% variation
      const newPrice = asset.currentPrice * (1 + changePoint.change * variation);
      pricePoint.prices[asset.id] = newPrice;
    });
    
    scenario.push(pricePoint);
  });
  
  return scenario;
}

module.exports = {
  generateSampleIndex,
  generatePredefinedIndex,
  generateTestOrders,
  generatePriceChangesScenario
};