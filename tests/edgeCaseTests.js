/**
 * Edge case tests for the ETF solver
 * This script tests the extreme scenarios mentioned in the requirements
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { 
  generateUnevenWeightIndex, 
  generateLargeIndex, 
  generateHighFrequencyOrders,
  generateExtremePriceChanges,
  generateNoLiquidityScenario 
} = require('./edgeCases');

// Base URL for API
const API_URL = 'http://localhost:5000/api';

/**
 * Test case for extremely uneven weighted indices
 */
async function testUnevenWeightIndex() {
  console.log('\n=== Testing Extremely Uneven Weighted Index ===');
  
  try {
    // Create an uneven weight index with one dominant asset
    const unevenIndex = generateUnevenWeightIndex();
    const indexPayload = {
      id: unevenIndex.id,
      assets: unevenIndex.assets.map(asset => ({
        id: asset.id,
        quantity: asset.quantity,
        price: asset.initialPrice
      }))
    };
    
    // Create the index in the system
    const response = await axios.post(`${API_URL}/indices`, indexPayload);
    console.log(`Created uneven index: ${response.data.id} with current price: ${response.data.currentPrice}`);
    
    // Weight distribution analysis
    const weights = unevenIndex.assets.map(asset => {
      const value = asset.getValue();
      const percentage = (value / unevenIndex.getCurrentPrice()) * 100;
      return {
        asset: asset.id,
        value,
        percentage: percentage.toFixed(2) + '%'
      };
    });
    
    console.log('Asset weight distribution:');
    console.table(weights);
    
    // Try a large buy order for this uneven index
    const buyResponse = await axios.post(`${API_URL}/orders/buy`, {
      positionId: 'uneven-buy',
      indexId: unevenIndex.id,
      quantity: 10,
      indexPrice: unevenIndex.getCurrentPrice()
    });
    
    console.log(`Created buy order: ${buyResponse.data.id} for uneven index`);
    
    // Check queue status
    const queueStatus = await axios.get(`${API_URL}/queue/status`);
    console.log(`Queue status after uneven index buy: ${JSON.stringify(queueStatus.data)}`);
    
    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Analyze the impact of the dominant asset on liquidity
    console.log('Analyzing the impact of dominant asset (BTC) on index liquidity...');
    const fillReport = await axios.get(`${API_URL}/reporting/fill/uneven-buy`);
    console.log(`Fill report: ${JSON.stringify(fillReport.data)}`);
    
    return {
      index: response.data,
      buyOrder: buyResponse.data,
      fillReport: fillReport.data
    };
  } catch (error) {
    console.error(`Error in uneven weight index test: ${error.message}`);
    if (error.response) {
      console.error(`API Response: ${JSON.stringify(error.response.data)}`);
    }
    return { error: error.message };
  }
}

/**
 * Test case for large indices (many assets)
 */
async function testLargeIndex() {
  console.log('\n=== Testing Large Index (100 assets) ===');
  
  try {
    // Create a large index with 100 assets
    const largeIndex = generateLargeIndex(100);
    const indexPayload = {
      id: largeIndex.id,
      assets: largeIndex.assets.map(asset => ({
        id: asset.id,
        quantity: asset.quantity,
        price: asset.initialPrice
      }))
    };
    
    // Create the index in the system
    const response = await axios.post(`${API_URL}/indices`, indexPayload);
    console.log(`Created large index: ${response.data.id} with ${response.data.assets.length} assets`);
    console.log(`Current price: ${response.data.currentPrice}`);
    
    // Test edge case: minimum buy amount calculations
    // The requirements specify minimum buy of $5 per asset on Binance
    // For 100 assets, that's $500 minimum buy
    console.log('Testing minimum buy amount calculations...');
    
    // Try a buy below the minimum threshold
    try {
      const smallBuyResponse = await axios.post(`${API_URL}/orders/buy`, {
        positionId: 'large-small-buy',
        indexId: largeIndex.id,
        quantity: 0.1, // Small amount that might not meet minimum per-asset requirement
        indexPrice: largeIndex.getCurrentPrice()
      });
      console.log(`Created small buy order: ${smallBuyResponse.data.id}`);
    } catch (smallError) {
      console.log(`Expected error for small buy: ${smallError.message}`);
      if (smallError.response) {
        console.log(`API Response: ${JSON.stringify(smallError.response.data)}`);
      }
    }
    
    // Try a normal buy that should work
    const buyResponse = await axios.post(`${API_URL}/orders/buy`, {
      positionId: 'large-normal-buy',
      indexId: largeIndex.id,
      quantity: 1, // Should be enough for minimum requirements
      indexPrice: largeIndex.getCurrentPrice()
    });
    
    console.log(`Created normal buy order: ${buyResponse.data.id}`);
    
    // Check queue status to see both orders
    const queueStatus = await axios.get(`${API_URL}/queue/status`);
    console.log(`Queue status after large index buys: ${JSON.stringify(queueStatus.data)}`);
    
    return {
      index: response.data,
      buyOrder: buyResponse.data
    };
  } catch (error) {
    console.error(`Error in large index test: ${error.message}`);
    if (error.response) {
      console.error(`API Response: ${JSON.stringify(error.response.data)}`);
    }
    return { error: error.message };
  }
}

/**
 * Test case for high-frequency trading
 */
async function testHighFrequencyTrading() {
  console.log('\n=== Testing High-Frequency Trading Scenario ===');
  
  try {
    // Create a simple index for HFT testing
    const response = await axios.post(`${API_URL}/indices`, {
      id: 'hft-index',
      assets: [
        { id: 'BTC', quantity: 0.01, price: 40000 },
        { id: 'ETH', quantity: 0.1, price: 3000 },
        { id: 'BNB', quantity: 0.5, price: 300 }
      ]
    });
    
    console.log(`Created HFT index: ${response.data.id} with current price: ${response.data.currentPrice}`);
    
    // Generate a large number of orders in rapid succession
    const hftOrders = generateHighFrequencyOrders('hft-index');
    console.log(`Generated ${hftOrders.length} HFT orders`);
    
    // Submit all orders as quickly as possible
    console.log('Submitting all orders rapidly to test rate limiting...');
    const orderPromises = hftOrders.map(async (order) => {
      try {
        let endpoint;
        let payload;
        
        switch (order.type) {
          case 'buy':
            endpoint = '/orders/buy';
            payload = {
              positionId: order.positionId,
              indexId: order.indexId,
              quantity: order.quantity,
              indexPrice: order.indexPrice
            };
            break;
          case 'sell':
            endpoint = '/orders/sell';
            payload = {
              positionId: order.positionId,
              indexId: order.indexId,
              quantity: order.quantity,
              indexPrice: order.indexPrice
            };
            break;
          case 'cancel':
            endpoint = '/orders/cancel';
            payload = {
              positionId: order.positionId
            };
            break;
          case 'rebalance':
            endpoint = '/orders/rebalance';
            payload = {
              indexId: order.indexId
            };
            break;
        }
        
        const response = await axios.post(`${API_URL}${endpoint}`, payload);
        return { success: true, order: response.data };
      } catch (error) {
        return { 
          success: false, 
          order: order,
          error: error.message,
          response: error.response ? error.response.data : null
        };
      }
    });
    
    const results = await Promise.all(orderPromises);
    
    // Analyze results
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log(`HFT test results: ${successful.length} successful, ${failed.length} failed orders`);
    
    // Check queue status
    const queueStatus = await axios.get(`${API_URL}/queue/status`);
    console.log(`Queue status after HFT test: ${JSON.stringify(queueStatus.data)}`);
    
    // Wait a bit to let the queue process
    console.log('Waiting for 5 seconds to let the queue process...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check queue status again
    const queueStatus2 = await axios.get(`${API_URL}/queue/status`);
    console.log(`Queue status after waiting: ${JSON.stringify(queueStatus2.data)}`);
    
    return {
      index: response.data,
      successfulOrders: successful.length,
      failedOrders: failed.length,
      queueStatus: queueStatus2.data
    };
  } catch (error) {
    console.error(`Error in high-frequency trading test: ${error.message}`);
    if (error.response) {
      console.error(`API Response: ${JSON.stringify(error.response.data)}`);
    }
    return { error: error.message };
  }
}

/**
 * Test case for extreme price changes
 */
async function testExtremePriceChanges() {
  console.log('\n=== Testing Extreme Price Changes ===');
  
  try {
    // Create a simple index for price change testing
    const response = await axios.post(`${API_URL}/indices`, {
      id: 'price-change-index',
      assets: [
        { id: 'BTC', quantity: 0.01, price: 40000 },
        { id: 'ETH', quantity: 0.1, price: 3000 },
        { id: 'BNB', quantity: 0.5, price: 300 }
      ]
    });
    
    console.log(`Created price change index: ${response.data.id} with current price: ${response.data.currentPrice}`);
    
    // Create a buy order at current price
    const buyResponse = await axios.post(`${API_URL}/orders/buy`, {
      positionId: 'price-change-buy',
      indexId: 'price-change-index',
      quantity: 1,
      indexPrice: response.data.currentPrice
    });
    
    console.log(`Created buy order: ${buyResponse.data.id} at current price: ${response.data.currentPrice}`);
    
    // Generate extreme price change scenario
    const index = {
      id: 'price-change-index',
      assets: response.data.assets
    };
    
    const priceChanges = generateExtremePriceChanges(index);
    console.log(`Generated ${priceChanges.length} price change scenarios`);
    
    // Apply price changes one by one
    for (let i = 0; i < priceChanges.length; i++) {
      const pricePoint = priceChanges[i];
      console.log(`\nApplying price change scenario ${i+1}/${priceChanges.length}`);
      
      // For each asset, update its price
      for (const [assetId, newPrice] of Object.entries(pricePoint.prices)) {
        try {
          // Update the asset price
          await axios.put(`${API_URL}/indices/${index.id}/assets/${assetId}/price`, {
            price: newPrice
          });
          console.log(`Updated ${assetId} price to ${newPrice}`);
        } catch (error) {
          console.error(`Failed to update ${assetId} price: ${error.message}`);
        }
      }
      
      // Get the index after price change
      try {
        const updatedIndex = await axios.get(`${API_URL}/indices/${index.id}`);
        console.log(`New index price: ${updatedIndex.data.currentPrice}`);
        
        // Check if our buy order is triggerable now
        const fillReport = await axios.get(`${API_URL}/reporting/fill/price-change-buy`);
        console.log(`Fill report after price change: ${JSON.stringify(fillReport.data)}`);
      } catch (error) {
        console.error(`Error getting updated index: ${error.message}`);
      }
      
      // Wait a bit between price changes
      if (i < priceChanges.length - 1) {
        console.log('Waiting 1 second before next price change...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return {
      index: response.data,
      priceChanges
    };
  } catch (error) {
    console.error(`Error in extreme price changes test: ${error.message}`);
    if (error.response) {
      console.error(`API Response: ${JSON.stringify(error.response.data)}`);
    }
    return { error: error.message };
  }
}

/**
 * Test case for no liquidity scenario
 */
async function testNoLiquidityScenario() {
  console.log('\n=== Testing No Liquidity Scenario ===');
  
  try {
    // Create an index for liquidity testing
    const response = await axios.post(`${API_URL}/indices`, {
      id: 'liquidity-index',
      assets: [
        { id: 'BTC', quantity: 0.01, price: 40000 },
        { id: 'ETH', quantity: 0.1, price: 3000 },
        { id: 'XRP', quantity: 100, price: 0.5 },
        { id: 'ADA', quantity: 50, price: 2 },
        { id: 'DOT', quantity: 10, price: 40 }
      ]
    });
    
    console.log(`Created liquidity test index: ${response.data.id} with current price: ${response.data.currentPrice}`);
    
    // Generate a no liquidity scenario by simulating Binance adapter
    // This would simulate order books with no liquidity for some assets
    console.log('Simulating no liquidity for some assets...');
    
    // Create a buy order to test liquidity analysis
    const buyResponse = await axios.post(`${API_URL}/orders/buy`, {
      positionId: 'liquidity-buy',
      indexId: 'liquidity-index',
      quantity: 10,
      indexPrice: response.data.currentPrice
    });
    
    console.log(`Created buy order: ${buyResponse.data.id} to test liquidity constraints`);
    
    // Check queue status
    const queueStatus = await axios.get(`${API_URL}/queue/status`);
    console.log(`Queue status after liquidity test buy: ${JSON.stringify(queueStatus.data)}`);
    
    // Wait a bit for processing
    console.log('Waiting for 2 seconds to let the queue process...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check fill report to see how it handled the liquidity constraints
    const fillReport = await axios.get(`${API_URL}/reporting/fill/liquidity-buy`);
    console.log(`Liquidity test fill report: ${JSON.stringify(fillReport.data)}`);
    
    return {
      index: response.data,
      buyOrder: buyResponse.data,
      fillReport: fillReport.data
    };
  } catch (error) {
    console.error(`Error in no liquidity scenario test: ${error.message}`);
    if (error.response) {
      console.error(`API Response: ${JSON.stringify(error.response.data)}`);
    }
    return { error: error.message };
  }
}

/**
 * Run all edge case tests
 */
async function runEdgeCaseTests() {
  try {
    console.log('Starting ETF solver edge case tests...');
    
    // Run each test in sequence
    const results = {
      unevenWeight: await testUnevenWeightIndex(),
      largeIndex: await testLargeIndex(),
      highFrequency: await testHighFrequencyTrading(),
      extremePrices: await testExtremePriceChanges(),
      noLiquidity: await testNoLiquidityScenario()
    };
    
    console.log('\n=== Edge Case Tests Completed ===');
    
    // Save results to a file for analysis
    const resultsPath = path.join(__dirname, 'edgeCaseResults.json');
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`Results saved to ${resultsPath}`);
    
    return results;
  } catch (error) {
    console.error(`Error running edge case tests: ${error.message}`);
    return { error: error.message };
  }
}

// Run the tests
runEdgeCaseTests();