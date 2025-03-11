const Index = require('../../src/models/Index');
const Asset = require('../../src/models/Asset');

describe('Index Model', () => {
  let index;
  
  beforeEach(() => {
    const assets = [
      new Asset('A', 1, 10, 10),
      new Asset('B', 2, 5, 5),
      new Asset('C', 5, 2, 2)
    ];
    
    index = new Index('test-index', assets);
  });
  
  test('should create an index with assets', () => {
    expect(index.id).toBe('test-index');
    expect(index.assets.length).toBe(3);
    expect(index.assets[0].id).toBe('A');
  });
  
  test('should calculate the current price correctly', () => {
    // 1*10 + 2*5 + 5*2 = 10 + 10 + 10 = 30
    expect(index.getCurrentPrice()).toBe(30);
  });
  
  test('should calculate the initial price correctly', () => {
    // 1*10 + 2*5 + 5*2 = 10 + 10 + 10 = 30
    expect(index.getInitialPrice()).toBe(30);
  });
  
  test('should update asset prices', () => {
    index.updateAssetPrice('A', 20);
    index.updateAssetPrice('B', 10);
    
    // 1*20 + 2*10 + 5*2 = 20 + 20 + 10 = 50
    expect(index.getCurrentPrice()).toBe(50);
  });
  
  test('should add an asset', () => {
    const newAsset = new Asset('D', 3, 7, 7);
    index.addAsset(newAsset);
    
    expect(index.assets.length).toBe(4);
    expect(index.getAsset('D')).toBe(newAsset);
    
    // 1*10 + 2*5 + 5*2 + 3*7 = 10 + 10 + 10 + 21 = 51
    expect(index.getCurrentPrice()).toBe(51);
  });
  
  test('should remove an asset', () => {
    const removed = index.removeAsset('B');
    
    expect(removed).toBe(true);
    expect(index.assets.length).toBe(2);
    expect(index.getAsset('B')).toBeNull();
    
    // 1*10 + 5*2 = 10 + 10 = 20
    expect(index.getCurrentPrice()).toBe(20);
  });
  
  test('should perform a rebalance', () => {
    const newAssets = [
      new Asset('A', 2, 15, 15),
      new Asset('D', 3, 5, 5)
    ];
    
    const rebalanceResult = index.rebalance(newAssets);
    
    // Check the rebalance report
    expect(rebalanceResult.oldPrice).toBe(30);
    expect(rebalanceResult.addedAssets.length).toBe(1); // D was added
    expect(rebalanceResult.removedAssets.length).toBe(2); // B and C were removed
    
    // Check index after rebalance
    expect(index.assets.length).toBe(2);
    expect(index.getAsset('A')).not.toBeNull();
    expect(index.getAsset('D')).not.toBeNull();
    expect(index.getAsset('B')).toBeNull();
    expect(index.getAsset('C')).toBeNull();
    
    // 2*15 + 3*5 = 30 + 15 = 45
    expect(index.getCurrentPrice()).toBe(45);
  });
  
  test('should clone an index', () => {
    const clone = index.clone();
    
    expect(clone).not.toBe(index); // Different object
    expect(clone.id).toBe(index.id);
    expect(clone.assets.length).toBe(index.assets.length);
    expect(clone.getCurrentPrice()).toBe(index.getCurrentPrice());
    
    // Modifying the clone should not affect the original
    clone.updateAssetPrice('A', 20);
    expect(clone.getCurrentPrice()).toBe(40);
    expect(index.getCurrentPrice()).toBe(30);
  });
  
  test('should serialize and deserialize', () => {
    const obj = index.toObject();
    const reconstructed = Index.fromObject(obj);
    
    expect(reconstructed.id).toBe(index.id);
    expect(reconstructed.assets.length).toBe(index.assets.length);
    expect(reconstructed.getCurrentPrice()).toBe(index.getCurrentPrice());
  });
});
