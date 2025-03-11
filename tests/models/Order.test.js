const Order = require('../../src/models/Order');

describe('Order Model', () => {
  test('should create a buy order', () => {
    const order = Order.createBuyOrder('position1', 'index1', 10, 100);
    
    expect(order.type).toBe('buy');
    expect(order.positionId).toBe('position1');
    expect(order.indexId).toBe('index1');
    expect(order.quantity).toBe(10);
    expect(order.indexPrice).toBe(100);
    expect(order.status).toBe('pending');
    expect(order.fillPercentage).toBe(0);
    expect(order.loss).toBe(0);
  });
  
  test('should create a sell order', () => {
    const order = Order.createSellOrder('position2', 'index1', 5, 200);
    
    expect(order.type).toBe('sell');
    expect(order.positionId).toBe('position2');
    expect(order.indexId).toBe('index1');
    expect(order.quantity).toBe(5);
    expect(order.indexPrice).toBe(200);
    expect(order.status).toBe('pending');
  });
  
  test('should create a cancel order', () => {
    const order = Order.createCancelOrder('position3');
    
    expect(order.type).toBe('cancel');
    expect(order.positionId).toBe('position3');
    expect(order.indexId).toBeNull();
    expect(order.quantity).toBeNull();
    expect(order.indexPrice).toBeNull();
    expect(order.status).toBe('pending');
  });
  
  test('should create a rebalance order', () => {
    const order = Order.createRebalanceOrder('index2');
    
    expect(order.type).toBe('rebalance');
    expect(order.indexId).toBe('index2');
    expect(order.quantity).toBeNull();
    expect(order.indexPrice).toBeNull();
    expect(order.status).toBe('pending');
  });
  
  test('should update order status', () => {
    const order = Order.createBuyOrder('position4', 'index3', 15, 50);
    
    order.updateStatus('processing');
    expect(order.status).toBe('processing');
    
    order.updateStatus('filled', { fillPercentage: 100, loss: 5 });
    expect(order.status).toBe('filled');
    expect(order.fillPercentage).toBe(100);
    expect(order.loss).toBe(5);
  });
  
  test('should add execution details', () => {
    const order = Order.createBuyOrder('position5', 'index4', 20, 75);
    
    order.updateStatus('processing', { 
      execution: { 
        price: 76, 
        slippage: 1.33 
      } 
    });
    
    expect(order.executionDetails.length).toBe(1);
    expect(order.executionDetails[0].price).toBe(76);
    expect(order.executionDetails[0].slippage).toBe(1.33);
  });
  
  test('should check if order is active', () => {
    const order = Order.createBuyOrder('position6', 'index5', 25, 150);
    
    expect(order.isActive()).toBe(true);
    
    order.updateStatus('processing');
    expect(order.isActive()).toBe(true);
    
    order.updateStatus('filled');
    expect(order.isActive()).toBe(false);
  });
  
  test('should check if order is complete', () => {
    const order = Order.createBuyOrder('position7', 'index6', 30, 200);
    
    expect(order.isComplete()).toBe(false);
    
    order.updateStatus('filled');
    expect(order.isComplete()).toBe(true);
    
    order.updateStatus('canceled');
    expect(order.isComplete()).toBe(true);
  });
  
  test('should check order type', () => {
    const buyOrder = Order.createBuyOrder('position8', 'index7', 35, 250);
    expect(buyOrder.isBuy()).toBe(true);
    expect(buyOrder.isSell()).toBe(false);
    expect(buyOrder.isCancel()).toBe(false);
    expect(buyOrder.isRebalance()).toBe(false);
    
    const sellOrder = Order.createSellOrder('position9', 'index8', 40, 300);
    expect(sellOrder.isBuy()).toBe(false);
    expect(sellOrder.isSell()).toBe(true);
    expect(sellOrder.isCancel()).toBe(false);
    expect(sellOrder.isRebalance()).toBe(false);
    
    const cancelOrder = Order.createCancelOrder('position10');
    expect(cancelOrder.isBuy()).toBe(false);
    expect(cancelOrder.isSell()).toBe(false);
    expect(cancelOrder.isCancel()).toBe(true);
    expect(cancelOrder.isRebalance()).toBe(false);
    
    const rebalanceOrder = Order.createRebalanceOrder('index9');
    expect(rebalanceOrder.isBuy()).toBe(false);
    expect(rebalanceOrder.isSell()).toBe(false);
    expect(rebalanceOrder.isCancel()).toBe(false);
    expect(rebalanceOrder.isRebalance()).toBe(true);
  });
  
  test('should serialize and deserialize', () => {
    const order = Order.createBuyOrder('position11', 'index10', 45, 350);
    order.updateStatus('processing');
    
    const obj = order.toObject();
    const reconstructed = Order.fromObject(obj);
    
    expect(reconstructed.id).toBe(order.id);
    expect(reconstructed.type).toBe(order.type);
    expect(reconstructed.positionId).toBe(order.positionId);
    expect(reconstructed.indexId).toBe(order.indexId);
    expect(reconstructed.quantity).toBe(order.quantity);
    expect(reconstructed.indexPrice).toBe(order.indexPrice);
    expect(reconstructed.status).toBe(order.status);
  });
});
