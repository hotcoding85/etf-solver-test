const QueueManager = require('../../src/services/QueueManager');
const Order = require('../../src/models/Order');

describe('Queue Manager', () => {
  let queueManager;
  
  beforeEach(() => {
    queueManager = new QueueManager();
  });
  
  test('should queue orders by type', () => {
    const buyOrder = Order.createBuyOrder('position1', 'index1', 10, 100);
    const sellOrder = Order.createSellOrder('position2', 'index1', 5, 200);
    const cancelOrder = Order.createCancelOrder('position3');
    const rebalanceOrder = Order.createRebalanceOrder('index1');
    
    queueManager.queueOrder(buyOrder);
    queueManager.queueOrder(sellOrder);
    queueManager.queueOrder(cancelOrder);
    queueManager.queueOrder(rebalanceOrder);
    
    const stats = queueManager.getStats();
    expect(stats.queued.buy).toBe(1);
    expect(stats.queued.sell).toBe(1);
    expect(stats.queued.cancel).toBe(1);
    expect(stats.queued.rebalance).toBe(1);
  });
  
  test('should retrieve orders by position ID', () => {
    const order1 = Order.createBuyOrder('position4', 'index2', 15, 150);
    const order2 = Order.createSellOrder('position5', 'index2', 7, 250);
    
    queueManager.queueOrder(order1);
    queueManager.queueOrder(order2);
    
    const found1 = queueManager.getOrderByPositionId('position4');
    const found2 = queueManager.getOrderByPositionId('position5');
    const notFound = queueManager.getOrderByPositionId('nonexistent');
    
    expect(found1).toBe(order1);
    expect(found2).toBe(order2);
    expect(notFound).toBeNull();
  });
  
  test('should remove orders by position ID', () => {
    const order = Order.createBuyOrder('position6', 'index3', 20, 300);
    queueManager.queueOrder(order);
    
    const removed = queueManager.removeOrderByPositionId('position6');
    expect(removed).toBe(order);
    
    const stats = queueManager.getStats();
    expect(stats.queued.buy).toBe(0);
    
    const nonexistent = queueManager.removeOrderByPositionId('nonexistent');
    expect(nonexistent).toBeNull();
  });
  
  test('should get batches respecting rate limits', () => {
    // Fill the queue with 200 buy orders
    for (let i = 0; i < 200; i++) {
      const order = Order.createBuyOrder(`position${i}`, 'index1', 10, 100);
      queueManager.queueOrder(order);
    }
    
    // Simple prioritizer function that just returns the first N orders
    const simplePrioritizer = (orders, limit) => {
      return orders.slice(0, limit);
    };
    
    // Get first batch
    const batch1 = queueManager.getNextBatch(simplePrioritizer);
    expect(batch1.length).toBe(100); // Should respect the rate limit
    
    // Since we're processing a batch, the next should be empty
    const batch2 = queueManager.getNextBatch(simplePrioritizer);
    expect(batch2.length).toBe(0);
    
    // Complete the batch
    queueManager.completeBatch(batch1);
    
    // Now we should be able to get another batch
    const batch3 = queueManager.getNextBatch(simplePrioritizer);
    expect(batch3.length).toBe(100);
  });
  
  test('should prioritize cancellations first', () => {
    // Add 50 buy orders and 10 cancel orders
    for (let i = 0; i < 50; i++) {
      const order = Order.createBuyOrder(`position_buy_${i}`, 'index1', 10, 100);
      queueManager.queueOrder(order);
    }
    
    for (let i = 0; i < 10; i++) {
      const order = Order.createCancelOrder(`position_cancel_${i}`);
      queueManager.queueOrder(order);
    }
    
    // Simple prioritizer
    const simplePrioritizer = (orders, limit) => {
      return orders.slice(0, limit);
    };
    
    // Get batch - should have all cancellations first
    const batch = queueManager.getNextBatch(simplePrioritizer);
    
    // Count cancellations at the start of the batch
    let cancelCount = 0;
    for (let i = 0; i < batch.length; i++) {
      if (batch[i].type === 'cancel') {
        cancelCount++;
      } else {
        break;
      }
    }
    
    expect(cancelCount).toBe(10);
  });
  
  test('should clear all queues', () => {
    const order1 = Order.createBuyOrder('position7', 'index4', 25, 150);
    const order2 = Order.createSellOrder('position8', 'index4', 12, 250);
    
    queueManager.queueOrder(order1);
    queueManager.queueOrder(order2);
    
    queueManager.clear();
    
    const stats = queueManager.getStats();
    expect(stats.queued.buy).toBe(0);
    expect(stats.queued.sell).toBe(0);
    expect(stats.processing.buy).toBe(0);
    expect(stats.processing.sell).toBe(0);
    expect(stats.history).toBe(0);
  });
});
