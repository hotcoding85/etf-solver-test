const OrderProcessor = require('../../src/services/OrderProcessor');
const QueueManager = require('../../src/services/QueueManager');
const LiquidityAnalyzer = require('../../src/services/LiquidityAnalyzer');
const BinanceAdapter = require('../../src/services/BinanceAdapter');
const RebalanceManager = require('../../src/services/RebalanceManager');
const Order = require('../../src/models/Order');
const Index = require('../../src/models/Index');
const Asset = require('../../src/models/Asset');
const { sleep } = require('../../src/utils/helpers');

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

describe('OrderProcessor', () => {
  let orderProcessor;
  let queueManager;
  let liquidityAnalyzer;
  let binanceAdapter;
  let rebalanceManager;
  let indices;
  
  beforeEach(() => {
    // Create dependencies
    queueManager = new QueueManager();
    liquidityAnalyzer = new LiquidityAnalyzer();
    binanceAdapter = new BinanceAdapter();
    rebalanceManager = new RebalanceManager();
    indices = new Map();
    
    // Create a sample index
    const assets = [
      new Asset('A', 1, 10, 10),
      new Asset('B', 2, 5, 5),
      new Asset('C', 5, 2, 2)
    ];
    const index = new Index('test-index', assets);
    indices.set('test-index', index);
    
    // Setup the order processor
    orderProcessor = new OrderProcessor(
      queueManager,
      liquidityAnalyzer,
      binanceAdapter,
      rebalanceManager,
      indices
    );
    
    // Mock methods
    liquidityAnalyzer.analyzeOrderLiquidity = jest.fn().mockImplementation(async (order, index) => {
      return {
        orderId: order.id,
        indexId: index.id,
        side: order.type,
        targetQuantity: order.quantity,
        fillableQuantity: order.quantity * 0.9, // 90% fillable
        fillablePercent: 90,
        worstAsset: 'C',
        assetAnalysis: [],
        assetOrders: [
          { assetId: 'A', quantity: 1 * 0.9, targetPrice: 10, side: order.type },
          { assetId: 'B', quantity: 2 * 0.9, targetPrice: 5, side: order.type },
          { assetId: 'C', quantity: 5 * 0.9, targetPrice: 2, side: order.type }
        ]
      };
    });
    
    binanceAdapter.executeOrder = jest.fn().mockImplementation(async () => {
      return {
        orderId: 'mock_order',
        positionId: 'mock_position',
        assets: [],
        totalTargetQuantity: 10,
        totalFilledQuantity: 9,
        overallFillRate: 90,
        filled: 90,
        loss: 2,
        timestamp: Date.now()
      };
    });
    
    binanceAdapter.cancelOrder = jest.fn().mockImplementation(async () => {
      return {
        positionId: 'mock_position',
        success: true,
        affectedOrders: ['mock_order'],
        fillPercentage: 10,
        loss: 1,
        timestamp: Date.now()
      };
    });
    
    rebalanceManager.createRebalancePlan = jest.fn().mockImplementation(async () => {
      return {
        indexId: 'test-index',
        timestamp: Date.now(),
        currentPrice: 30,
        currentAssets: [],
        newAssets: [],
        assetChanges: [],
        estimatedCosts: { totalCost: 5 }
      };
    });
    
    rebalanceManager.executeRebalance = jest.fn().mockImplementation(async () => {
      return {
        indexId: 'test-index',
        timestamp: Date.now(),
        totalLoss: 3,
        executionResults: [],
        rebalanceReport: {}
      };
    });
  });
  
  afterEach(() => {
    orderProcessor.stop();
    jest.clearAllMocks();
  });
  
  test('should start and stop the processor', () => {
    expect(orderProcessor.isRunning).toBe(false);
    
    orderProcessor.start();
    expect(orderProcessor.isRunning).toBe(true);
    
    orderProcessor.stop();
    expect(orderProcessor.isRunning).toBe(false);
  });
  
  test('should process a buy order', async () => {
    const order = Order.createBuyOrder('test-position', 'test-index', 10, 30);
    
    const processedOrder = await orderProcessor.processOrder(order);
    
    expect(processedOrder.status).toBe('partially_filled');
    expect(processedOrder.fillPercentage).toBe(90);
    expect(processedOrder.loss).toBe(2);
    expect(liquidityAnalyzer.analyzeOrderLiquidity).toHaveBeenCalledTimes(1);
    expect(binanceAdapter.executeOrder).toHaveBeenCalledTimes(1);
  });
  
  test('should not trigger buy order if price condition not met', async () => {
    // Set the limit price below the current index price (30)
    const order = Order.createBuyOrder('test-position-2', 'test-index', 10, 25);
    
    const processedOrder = await orderProcessor.processOrder(order);
    
    expect(processedOrder.status).toBe('pending');
    expect(liquidityAnalyzer.analyzeOrderLiquidity).not.toHaveBeenCalled();
    expect(binanceAdapter.executeOrder).not.toHaveBeenCalled();
  });
  
  test('should process a sell order', async () => {
    const order = Order.createSellOrder('test-position-3', 'test-index', 10, 30);
    
    const processedOrder = await orderProcessor.processOrder(order);
    
    expect(processedOrder.status).toBe('partially_filled');
    expect(processedOrder.fillPercentage).toBe(90);
    expect(processedOrder.loss).toBe(2);
    expect(liquidityAnalyzer.analyzeOrderLiquidity).toHaveBeenCalledTimes(1);
    expect(binanceAdapter.executeOrder).toHaveBeenCalledTimes(1);
  });
  
  test('should process a cancel order for a pending order', async () => {
    // First queue a buy order
    const buyOrder = Order.createBuyOrder('test-position-4', 'test-index', 10, 30);
    queueManager.queueOrder(buyOrder);
    
    // Then cancel it
    const cancelOrder = Order.createCancelOrder('test-position-4');
    
    const processedOrder = await orderProcessor.processOrder(cancelOrder);
    
    expect(processedOrder.status).toBe('filled');
    expect(queueManager.getOrderByPositionId('test-position-4')).toBeNull();
    expect(binanceAdapter.cancelOrder).not.toHaveBeenCalled(); // No need to cancel with Binance
  });
  
  test('should process a cancel order for a processing order', async () => {
    // Create a processing buy order
    const buyOrder = Order.createBuyOrder('test-position-5', 'test-index', 10, 30);
    buyOrder.updateStatus('processing');
    queueManager.processing.buy.push(buyOrder);
    
    // Cancel it
    const cancelOrder = Order.createCancelOrder('test-position-5');
    
    const processedOrder = await orderProcessor.processOrder(cancelOrder);
    
    expect(processedOrder.status).toBe('filled');
    expect(binanceAdapter.cancelOrder).toHaveBeenCalledTimes(1);
  });
  
  test('should fail to cancel non-existent order', async () => {
    const cancelOrder = Order.createCancelOrder('non-existent');
    
    const processedOrder = await orderProcessor.processOrder(cancelOrder);
    
    expect(processedOrder.status).toBe('failed');
    expect(binanceAdapter.cancelOrder).not.toHaveBeenCalled();
  });
  
  test('should process a rebalance order', async () => {
    const order = Order.createRebalanceOrder('test-index');
    
    const processedOrder = await orderProcessor.processOrder(order);
    
    expect(processedOrder.status).toBe('filled');
    expect(processedOrder.loss).toBe(3);
    expect(rebalanceManager.createRebalancePlan).toHaveBeenCalledTimes(1);
    expect(rebalanceManager.executeRebalance).toHaveBeenCalledTimes(1);
  });
  
  test('should handle missing index', async () => {
    const order = Order.createBuyOrder('test-position-6', 'non-existent-index', 10, 30);
    
    const processedOrder = await orderProcessor.processOrder(order);
    
    expect(processedOrder.status).toBe('failed');
    expect(liquidityAnalyzer.analyzeOrderLiquidity).not.toHaveBeenCalled();
    expect(binanceAdapter.executeOrder).not.toHaveBeenCalled();
  });
  
  test('should process a batch of orders', async () => {
    // Queue several orders
    const buy1 = Order.createBuyOrder('test-position-7', 'test-index', 10, 30);
    const sell1 = Order.createSellOrder('test-position-8', 'test-index', 5, 30);
    const cancel1 = Order.createCancelOrder('test-position-9');
    
    queueManager.queueOrder(buy1);
    queueManager.queueOrder(sell1);
    queueManager.queueOrder(cancel1);
    
    // Process the batch
    await orderProcessor.processBatch();
    
    // Check that orders were processed
    expect(queueManager.queues.buy.length).toBe(0);
    expect(queueManager.queues.sell.length).toBe(0);
    expect(queueManager.queues.cancel.length).toBe(0);
    expect(queueManager.executionHistory.length).toBe(3);
  });
  
  test('should handle errors during order processing', async () => {
    // Make the Binance adapter throw an error
    binanceAdapter.executeOrder.mockImplementation(() => {
      throw new Error('Simulated Binance error');
    });
    
    const order = Order.createBuyOrder('test-position-10', 'test-index', 10, 30);
    
    const processedOrder = await orderProcessor.processOrder(order);
    
    expect(processedOrder.status).toBe('failed');
    expect(processedOrder.executionDetails[0].error).toContain('Simulated Binance error');
  });
});
