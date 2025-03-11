
module.exports = {
  RATE_LIMIT: 100, // 100 orders per window
  RATE_LIMIT_WINDOW_MS: 10000, // 10 seconds window
  
  MIN_ASSET_PURCHASE: 5, // $5 minimum per asset
  
  DEFAULT_INDEX_PRICE: 1000, // Initial index price
  
  TRADING_FEE_PERCENT: 0.1, // 0.1% trading fee
  
  DEFAULT_BATCH_SIZE: 10,
  
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  PORT: process.env.PORT || 5000,
};
