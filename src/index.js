const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const { PORT, HOST } = require('./utils/constants');
const logger = require('./utils/logger');

// Models
const Asset = require('./models/Asset');
const Index = require('./models/Index');
const Order = require('./models/Order');

// Services
const QueueManager = require('./services/QueueManager');
const OrderProcessor = require('./services/OrderProcessor');

// Initialize the application
const app = express();
app.use(cors());
app.use(bodyParser.json());

// In-memory storage for indices and orders
const indices = new Map();
const positions = new Map();

// Initialize service objects
const queueManager = new QueueManager();
// Set up the order processor
const orderProcessor = new OrderProcessor(
  queueManager,
  liquidityAnalyzer,
  binanceAdapter,
  rebalanceManager,
  indices
);

// Start the order processor
orderProcessor.start();

// API Routes
// 1. Index Management
app.post('/api/indices', (req, res) => {
  try {
    const { id, assets } = req.body;
    
    if (indices.has(id)) {
      return res.status(400).json({ error: `Index ${id} already exists` });
    }
    
    const indexAssets = assets.map(asset => 
      new Asset(asset.id, asset.quantity, asset.price, asset.price));
    
    const index = new Index(id, indexAssets);
    indices.set(id, index);
    
    logger.info(`Created index ${id} with ${assets.length} assets`);
    return res.status(201).json(index.toObject());
  } catch (error) {
    logger.error(`Error creating index: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/indices/:id', (req, res) => {
  const { id } = req.params;
  const index = indices.get(id);
  
  if (!index) {
    return res.status(404).json({ error: `Index ${id} not found` });
  }
  
  return res.json(index.toObject());
});

app.get('/api/indices', (req, res) => {
  const allIndices = Array.from(indices.values()).map(index => index.toObject());
  return res.json(allIndices);
});

// Update asset price in an index
app.put('/api/indices/:indexId/assets/:assetId/price', (req, res) => {
  try {
    const { indexId, assetId } = req.params;
    const { price } = req.body;
    
    if (!indices.has(indexId)) {
      return res.status(404).json({ error: `Index ${indexId} not found` });
    }
    
    const index = indices.get(indexId);
    const updated = index.updateAssetPrice(assetId, price);
    
    if (!updated) {
      return res.status(404).json({ error: `Asset ${assetId} not found in index ${indexId}` });
    }
    
    logger.info(`Updated price of asset ${assetId} in index ${indexId} to ${price}`);
    return res.json(index.toObject());
  } catch (error) {
    logger.error(`Error updating asset price: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

// Delete an index
app.delete('/api/indices/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    if (!indices.has(id)) {
      return res.status(404).json({ error: `Index ${id} not found` });
    }
    
    indices.delete(id);
    logger.info(`Deleted index ${id}`);
    return res.status(204).send();
  } catch (error) {
    logger.error(`Error deleting index: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

// 2. Order Management
app.post('/api/orders/buy', (req, res) => {
  try {
    const { positionId, indexId, quantity, indexPrice } = req.body;
    
    if (!indices.has(indexId)) {
      return res.status(404).json({ error: `Index ${indexId} not found` });
    }
    
    if (positions.has(positionId)) {
      return res.status(400).json({ error: `Position ${positionId} already exists` });
    }
    
    const order = Order.createBuyOrder(positionId, indexId, quantity, indexPrice);
    positions.set(positionId, order);
    
    queueManager.queueOrder(order);
    
    logger.info(`Queued buy order for position ${positionId} (index: ${indexId}, qty: ${quantity}, price: ${indexPrice})`);
    return res.status(201).json(order.toObject());
  } catch (error) {
    logger.error(`Error creating buy order: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/orders/sell', (req, res) => {
  try {
    const { positionId, indexId, quantity, indexPrice } = req.body;
    
    if (!indices.has(indexId)) {
      return res.status(404).json({ error: `Index ${indexId} not found` });
    }
    
    const order = Order.createSellOrder(positionId, indexId, quantity, indexPrice);
    
    // We don't check for position existence here as it might be a new sell position
    positions.set(positionId, order);
    
    queueManager.queueOrder(order);
    
    logger.info(`Queued sell order for position ${positionId} (index: ${indexId}, qty: ${quantity}, price: ${indexPrice})`);
    return res.status(201).json(order.toObject());
  } catch (error) {
    logger.error(`Error creating sell order: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/orders/cancel', (req, res) => {
  try {
    const { positionId } = req.body;
    
    if (!positions.has(positionId)) {
      return res.status(404).json({ error: `Position ${positionId} not found` });
    }
    
    const order = Order.createCancelOrder(positionId);
    
    queueManager.queueOrder(order);
    
    logger.info(`Queued cancel order for position ${positionId}`);
    return res.status(201).json(order.toObject());
  } catch (error) {
    logger.error(`Error creating cancel order: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/orders/rebalance', (req, res) => {
  try {
    const { indexId } = req.body;
    
    if (!indices.has(indexId)) {
      return res.status(404).json({ error: `Index ${indexId} not found` });
    }
    
    const order = Order.createRebalanceOrder(indexId);
    
    queueManager.queueOrder(order);
    
    logger.info(`Queued rebalance order for index ${indexId}`);
    return res.status(201).json(order.toObject());
  } catch (error) {
    logger.error(`Error creating rebalance order: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

// 3. Position Management
app.get('/api/positions/:id', (req, res) => {
  const { id } = req.params;1
  const position = positions.get(id);
  
  if (!position) {
    return res.status(404).json({ error: `Position ${id} not found` });
  }
  
  return res.json(position.toObject());1
});

app.get('/api/positions', (req, res) => {
  const allPositions = Array.from(positions.values()).map(position => position.toObject());
  return res.json(allPositions);
});

// 4. Fill Reporting
app.get('/api/reporting/fill/:positionId', (req, res) => {
  const { positionId } = req.params;
  const position = positions.get(positionId);
  
  if (!position) {
    return res.status(404).json({ error: `Position ${positionId} not found` });
  }
  
  const fillReport = {
    positionId,
    orderType: position.type,
    indexId: position.indexId,
    status: position.status,
    fillPercentage: position.fillPercentage,
    loss: position.loss,
    executionDetails: position.executionDetails,
    createdAt: position.createdAt,
    updatedAt: position.updatedAt
  };
  
  return res.json(fillReport);
});

// 5. Rebalance Reporting
app.get('/api/reporting/rebalance/:indexId', (req, res) => {
  const { indexId } = req.params;
  
  if (!indices.has(indexId)) {
    return res.status(404).json({ error: `Index ${indexId} not found` });
  }
  
  const rebalanceHistory = rebalanceManager.getRebalanceHistory(indexId);
  
  return res.json(rebalanceHistory);
});

// 6. Queue Status
app.get('/api/queue/status', (req, res) => {
  const queueStatus = queueManager.getStats();
  return res.json(queueStatus);
});

// Start the server
app.listen(PORT, HOST, () => {
  logger.info(`Server running at http://${HOST}:${PORT}`);
});

// Export for testing purposes
module.exports = {
  app,
  indices,
  positions,
  orderProcessor,
  queueManager,
  liquidityAnalyzer,
  binanceAdapter,
  rebalanceManager
};
git 