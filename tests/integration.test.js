const { 
  app, 
  indices, 
  positions, 
  orderProcessor, 
  queueManager, 
  liquidityAnalyzer, 
  binanceAdapter, 
  rebalanceManager 
} = require('../src/index');
const request = require('supertest');
const Index = require('../src/models/Index');
const Asset = require('../src/models/Asset');
const { RATE_LIMIT_WINDOW_MS } = require('../src/utils/constants');

// Mock the rate limit window to make tests faster
jest.mock('../src/utils/constants', () => ({
  ...jest.requireActual('../src/utils/constants'),
  RATE_LIMIT_WINDOW_MS: 100 // 100ms instead of 10 seconds
}));

// Mock Winston logger
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

describe('ETF Solver Integration Tests', () => {
  beforeAll(() => {
    // Stop the processor that was started in index.js
    orderProcessor.stop();
    
    // Configure the processor to run more frequently for testing
    orderProcessor.start(100);
  });
  
  afterAll(done => {
    orderProcessor.stop();
    done();
  });
  
  beforeEach(() => {
    // Clear all data
    indices.clear();
    positions.clear();
    queueManager.clear();
    binanceAdapter.clear();
    liquidityAnalyzer.clearCache();
    rebalanceManager.clearHistory();
  });
  
  describe('Index Management API', () => {
    test('should create a new index', async () => {
      const res = await request(app)
        .post('/api/indices')
        .send({
          id: 'test-index',
          assets: [
            { id: 'A', quantity: 1, price: 10 },
            { id: 'B', quantity: 2, price: 5 },
            { id: 'C', quantity: 5, price: 2 }
          ]
        });
      
      expect(res.statusCode).toBe(201);
      expect(res.body.id).toBe('test-index');
      expect(res.body.assets.length).toBe(3);
      expect(res.body.currentPrice).toBe(30);
    });
    
    test('should get an index by ID', async () => {
      // Create an index first
      await request(app)
        .post('/api/indices')
        .send({
          id: 'test-index-2',
          assets: [
            { id: 'X', quantity: 3, price: 10 },
            { id: 'Y', quantity: 4, price: 5 }
          ]
        });
      
      // Get the index
      const res = await request(app)
        .get('/api/indices/test-index-2');
      
      expect(res.statusCode).toBe(200);
      expect(res.body.id).toBe('test-index-2');
      expect(res.body.assets.length).toBe(2);
      expect(res.body.currentPrice).toBe(50);
    });
    
    test('should get all indices', async () => {
      // Create two indices
      await request(app)
        .post('/api/indices')
        .send({
          id: 'index-a',
          assets: [{ id: 'A1', quantity: 1, price: 100 }]
        });
      
      await request(app)
        .post('/api/indices')
        .send({
          id: 'index-b',
          assets: [{ id: 'B1', quantity: 2, price: 50 }]
        });
      
      // Get all indices
      const res = await request(app)
        .get('/api/indices');
      
      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBe(2);
      expect(res.body.map(i => i.id)).toContain('index-a');
      expect(res.body.map(i => i.id)).toContain('index-b');
    });
  });
  
  describe('Order Management API', () => {
    beforeEach(async () => {
      // Create an index for testing
      await request(app)
        .post('/api/indices')
        .send({
          id: 'order-test-index',
          assets: [
            { id: 'A', quantity: 1, price: 10 },
            { id: 'B', quantity: 2, price: 5 },
            { id: 'C', quantity: 5, price: 2 }
          ]
        });
    });
    
    test('should create a buy order', async () => {
      const res = await request(app)
        .post('/api/orders/buy')
        .send({
          positionId: 'position-1',
          indexId: 'order-test-index',
          quantity: 10,
          indexPrice: 30
        });
      
      expect(res.statusCode).toBe(201);
      expect(res.body.type).toBe('buy');
      expect(res.body.positionId).toBe('position-1');
      expect(res.body.quantity).toBe(10);
      expect(res.body.status).toBe('pending');
      
      // Check that the order was queued
      const queueStats = await request(app)
        .get('/api/queue/status');
      
      expect(queueStats.body.queued.buy).toBe(1);
    });
    
    test('should create a sell order', async () => {
      const res = await request(app)
        .post('/api/orders/sell')
        .send({
          positionId: 'position-2',
          indexId: 'order-test-index',
          quantity: 5,
          indexPrice: 30
        });
      
      expect(res.statusCode).toBe(201);
      expect(res.body.type).toBe('sell');
      expect(res.body.positionId).toBe('position-2');
      expect(res.body.quantity).toBe(5);
      expect(res.body.status).toBe('pending');
      
      // Check that the order was queued
      const queueStats = await request(app)
        .get('/api/queue/status');
      
      expect(queueStats.body.queued.sell).toBe(1);
    });
    
    test('should create a cancel order', async () => {
      // First create an order to cancel
      await request(app)
        .post('/api/orders/buy')
        .send({
          positionId: 'position-to-cancel',
          indexId: 'order-test-index',
          quantity: 15,
          indexPrice: 30
        });
      
      // Then cancel it
      const res = await request(app)
        .post('/api/orders/cancel')
        .send({
          positionId: 'position-to-cancel'
        });
      
      expect(res.statusCode).toBe(201);
      expect(res.body.type).toBe('cancel');
      expect(res.body.positionId).toBe('position-to-cancel');
      expect(res.body.status).toBe('pending');
      
      // Check that the cancel order was queued
      const queueStats = await request(app)
        .get('/api/queue/status');
      
      expect(queueStats.body.queued.cancel).toBe(1);
    });
    
    test('should create a rebalance order', async () => {
      const res = await request(app)
        .post('/api/orders/rebalance')
        .send({
          indexId: 'order-test-index'
        });
      
      expect(res.statusCode).toBe(201);
      expect(res.body.type).toBe('rebalance');
      expect(res.body.indexId).toBe('order-test-index');
      expect(res.body.status).toBe('pending');
      
      // Check that the rebalance order was queued
      const queueStats = await request(app)
        .get('/api/queue/status');
      
      expect(queueStats.body.queued.rebalance).toBe(1);
    });
  });
  
  describe('Position Management API', () => {
    beforeEach(async () => {
      // Create an index for testing
      await request(app)
        .post('/api/indices')
        .send({
          id: 'position-test-index',
          assets: [
            { id: 'A', quantity: 1, price: 10 },
            { id: 'B', quantity: 2, price: 5 }
          ]
        });
      
      // Create a position
      await request(app)
        .post('/api/orders/buy')
        .send({
          positionId: 'test-position',
          indexId: 'position-test-index',
          quantity: 10,
          indexPrice: 20
        });
    });
    
    test('should get a position by ID', async () => {
      const res = await request(app)
        .get('/api/positions/test-position');
      
      expect(res.statusCode).toBe(200);
      expect(res.body.positionId).toBe('test-position');
      expect(res.body.indexId).toBe('position-test-index');
      expect(res.body.quantity).toBe(10);
    });
    
    test('should get all positions', async () => {
      // Create another position
      await request(app)
        .post('/api/orders/sell')
        .send({
          positionId: 'another-position',
          indexId: 'position-test-index',
          quantity: 5,
          indexPrice: 20
        });
      
      const res = await request(app)
        .get('/api/positions');
      
      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBe(2);
      expect(res.body.map(p => p.positionId)).toContain('test-position');
      expect(res.body.map(p => p.positionId)).toContain('another-position');
    });
  });
  
  describe('Reporting API', () => {
    beforeEach(async () => {
      // Create an index for testing
      await request(app)
        .post('/api/indices')
        .send({
          id: 'reporting-test-index',
          assets: [
            { id: 'A', quantity: 1, price: 10 },
            { id: 'B', quantity: 2, price: 5 }
          ]
        });
      
      // Create a position
      await request(app)
        .post('/api/orders/buy')
        .send({
          positionId: 'reporting-position',
          indexId: 'reporting-test-index',
          quantity: 10,
          indexPrice: 20
        });
    });
    
    test('should get fill report for a position', async () => {
      const res = await request(app)
        .get('/api/reporting/fill/reporting-position');
      
      expect(res.statusCode).toBe(200);
      expect(res.body.positionId).toBe('reporting-position');
      expect(res.body.orderType).toBe('buy');
      expect(res.body.indexId).toBe('reporting-test-index');
      expect(res.body.status).toBe('pending');
      expect(res.body.fillPercentage).toBe(0);
    });
    
    test('should get rebalance report for an index', async () => {
      // First trigger a rebalance
      await request(app)
        .post('/api/orders/rebalance')
        .send({
          indexId: 'reporting-test-index'
        });
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const res = await request(app)
        .get('/api/reporting/rebalance/reporting-test-index');
      
      expect(res.statusCode).toBe(200);
      // The format will depend on the rebalance implementation
      // Just verify it returns something valid
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
  
  describe('End-to-End Scenarios', () => {
    // Create a standard index for testing
    beforeEach(async () => {
      await request(app)
        .post('/api/indices')
        .send({
          id: 'e2e-test-index',
          assets: [
            { id: 'A', quantity: 1, price: 10 },
            { id: 'B', quantity: 2, price: 5 },
            { id: 'C', quantity: 5, price: 2 }
          ]
        });
    });
    
    test('should process a buy order through the full lifecycle', async () => {
      // Create a buy order
      const buyRes = await request(app)
        .post('/api/orders/buy')
        .send({
          positionId: 'e2e-buy-position',
          indexId: 'e2e-test-index',
          quantity: 10,
          indexPrice: 30 // Matches current price, should trigger
        });
      
      expect(buyRes.statusCode).toBe(201);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Check the position status
      const positionRes = await request(app)
        .get('/api/positions/e2e-buy-position');
      
      // Should now be filled or partially filled
      expect(['filled', 'partially_filled']).toContain(positionRes.body.status);
      expect(positionRes.body.fillPercentage).toBeGreaterThan(0);
      
      // Check the fill report
      const fillRes = await request(app)
        .get('/api/reporting/fill/e2e-buy-position');
      
      expect(fillRes.body.status).toBe(positionRes.body.status);
      expect(fillRes.body.fillPercentage).toBe(positionRes.body.fillPercentage);
    });
    
    test('should process a cancel order', async () => {
      // Create a buy order with a price that won't trigger immediately
      const buyRes = await request(app)
        .post('/api/orders/buy')
        .send({
          positionId: 'e2e-cancel-position',
          indexId: 'e2e-test-index',
          quantity: 10,
          indexPrice: 25 // Below current price, won't trigger
        });
      
      expect(buyRes.statusCode).toBe(201);
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check the position is still pending
      const positionBeforeRes = await request(app)
        .get('/api/positions/e2e-cancel-position');
      
      expect(positionBeforeRes.body.status).toBe('pending');
      
      // Cancel the order
      const cancelRes = await request(app)
        .post('/api/orders/cancel')
        .send({
          positionId: 'e2e-cancel-position'
        });
      
      expect(cancelRes.statusCode).toBe(201);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // The original order should now be canceled
      const positionAfterRes = await request(app)
        .get('/api/positions/e2e-cancel-position');
      
      expect(positionAfterRes.body.status).toBe('canceled');
    });
    
    test('should process a rebalance order', async () => {
      // Get initial index data
      const initialIndexRes = await request(app)
        .get('/api/indices/e2e-test-index');
      
      const initialAssets = initialIndexRes.body.assets;
      
      // Trigger a rebalance
      const rebalanceRes = await request(app)
        .post('/api/orders/rebalance')
        .send({
          indexId: 'e2e-test-index'
        });
      
      expect(rebalanceRes.statusCode).toBe(201);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Check rebalance history
      const historyRes = await request(app)
        .get('/api/reporting/rebalance/e2e-test-index');
      
      expect(historyRes.body.length).toBeGreaterThan(0);
      
      // Get updated index data
      const updatedIndexRes = await request(app)
        .get('/api/indices/e2e-test-index');
      
      // The assets should have been rebalanced
      expect(updatedIndexRes.body.assets).not.toEqual(initialAssets);
    });
    
    test('should handle rate limiting for multiple orders', async () => {
      // Submit many orders at once
      const orderCount = 150;
      const orderPromises = [];
      
      for (let i = 0; i < orderCount; i++) {
        orderPromises.push(
          request(app)
            .post('/api/orders/buy')
            .send({
              positionId: `rate-limit-position-${i}`,
              indexId: 'e2e-test-index',
              quantity: 1,
              indexPrice: 30
            })
        );
      }
      
      // Wait for all orders to be submitted
      await Promise.all(orderPromises);
      
      // Check queue stats
      const initialQueueRes = await request(app)
        .get('/api/queue/status');
      
      // Should have many orders queued
      expect(initialQueueRes.body.queued.buy).toBeGreaterThan(0);
      
      // Wait for processing (needs to be longer for many orders)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check order processing
      const positions = [];
      for (let i = 0; i < 5; i++) { // Check a few of the positions
        const posRes = await request(app)
          .get(`/api/positions/rate-limit-position-${i}`);
        
        positions.push(posRes.body);
      }
      
      // Some orders should have been processed
      const processedCount = positions.filter(p => p.status !== 'pending').length;
      expect(processedCount).toBeGreaterThan(0);
      
      // Final queue stats
      const finalQueueRes = await request(app)
        .get('/api/queue/status');
      
      // Some orders should have been moved to history
      expect(finalQueueRes.body.history).toBeGreaterThan(0);
    });
  });
});
