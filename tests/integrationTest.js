/**
 * Integration tests for the ETF solver
 */
const axios = require('axios');
const { generateSampleIndex, generateTestOrders } = require('./mockData');

// Base URL for API
const API_URL = 'http://localhost:5000/api';

/**
 * Basic Index Creation and Management Tests
 */
async function testIndexCreation() {
  console.log('--- Testing Index Creation ---');
  
  try {
    // Generate a sample index
    const sampleIndex = generateSampleIndex('test-index', 5);
    const indexPayload = {
      id: sampleIndex.id,
      assets: sampleIndex.assets.map(asset => ({
        id: asset.id,
        quantity: asset.quantity,
        price: asset.initialPrice
      }))
    };
    
    // Create the index
    const response = await axios.post(`${API_URL}/indices`, indexPayload);
    console.log(`Created index: ${response.data.id} with ${response.data.assets.length} assets`);
    
    // Verify index data
    const getResponse = await axios.get(`${API_URL}/indices/${sampleIndex.id}`);
    console.log(`Retrieved index price: ${getResponse.data.currentPrice}`);
    
    // Update a single asset price
    const assetId = sampleIndex.assets[0].id;
    const newPrice = sampleIndex.assets[0].initialPrice * 1.1; // 10% higher
    
    await axios.put(`${API_URL}/indices/${sampleIndex.id}/assets/${assetId}/price`, {
      price: newPrice
    });
    
    console.log(`Updated ${assetId} price to ${newPrice}`);
    
    // Get the index again to verify price change
    const updatedResponse = await axios.get(`${API_URL}/indices/${sampleIndex.id}`);
    console.log(`Updated index price: ${updatedResponse.data.currentPrice}`);
    
    // Delete the index
    await axios.delete(`${API_URL}/indices/${sampleIndex.id}`);
    console.log(`Deleted index: ${sampleIndex.id}`);
    
    return {
      created: response.data,
      retrieved: getResponse.data,
      updated: updatedResponse.data
    };
  } catch (error) {
    console.error(`Error in index creation test: ${error.message}`);
    if (error.response) {
      console.error(`API Response: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * Test basic order operations (buy, sell, cancel)
 */
async function testOrderOperations(indexId = 'test-orders-index') {
  console.log('\n--- Testing Order Operations ---');
  
  try {
    // Create a sample index first
    const sampleIndex = generateSampleIndex(indexId, 5);
    const indexPayload = {
      id: sampleIndex.id,
      assets: sampleIndex.assets.map(asset => ({
        id: asset.id,
        quantity: asset.quantity,
        price: asset.initialPrice
      }))
    };
    
    await axios.post(`${API_URL}/indices`, indexPayload);
    console.log(`Created index: ${indexPayload.id} for order testing`);
    
    // Create a buy order
    const buyResponse = await axios.post(`${API_URL}/orders/buy`, {
      positionId: 'test-buy-1',
      indexId: indexId,
      quantity: 1,
      indexPrice: 1000
    });
    
    console.log(`Created buy order: ${buyResponse.data.id}`);
    
    // Create a sell order
    const sellResponse = await axios.post(`${API_URL}/orders/sell`, {
      positionId: 'test-sell-1',
      indexId: indexId,
      quantity: 0.5,
      indexPrice: 1020
    });
    
    console.log(`Created sell order: ${sellResponse.data.id}`);
    
    // Check queue status
    const queueStatus = await axios.get(`${API_URL}/queue/status`);
    console.log(`Queue status: ${JSON.stringify(queueStatus.data)}`);
    
    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Cancel the buy order
    const cancelResponse = await axios.post(`${API_URL}/orders/cancel`, {
      positionId: 'test-buy-1'
    });
    
    console.log(`Created cancel order: ${cancelResponse.data.id}`);
    
    // Wait for cancel to process
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check queue status again
    const queueStatus2 = await axios.get(`${API_URL}/queue/status`);
    console.log(`Queue status after cancel: ${JSON.stringify(queueStatus2.data)}`);
    
    return {
      buyOrder: buyResponse.data,
      sellOrder: sellResponse.data,
      cancelOrder: cancelResponse.data,
      queueStatus: queueStatus2.data
    };
  } catch (error) {
    console.error(`Error in order operations test: ${error.message}`);
    if (error.response) {
      console.error(`API Response: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * Test uneven weight index scenario
 */
async function testUnevenWeightIndex() {
  console.log('\n--- Testing Uneven Weight Index ---');
  
  try {
    // Create an uneven index with one dominant asset
    const indexPayload = {
      id: 'uneven-test-index',
      assets: [
        { id: 'BTC', quantity: 0.02, price: 40000 },  // $800 - 80%
        { id: 'ETH', quantity: 0.02, price: 3000 },   // $60 - 6%
        { id: 'BNB', quantity: 0.1, price: 300 },     // $30 - 3%
        { id: 'XRP', quantity: 20, price: 0.5 },      // $10 - 1%
        { id: 'ADA', quantity: 5, price: 2 }          // $10 - 1%
      ]
    };
    
    // Create the index
    const response = await axios.post(`${API_URL}/indices`, indexPayload);
    console.log(`Created uneven index: ${response.data.id} with price: ${response.data.currentPrice}`);
    
    // Create a buy order for this uneven index
    const buyResponse = await axios.post(`${API_URL}/orders/buy`, {
      positionId: 'uneven-buy-1',
      indexId: 'uneven-test-index',
      quantity: 1,
      indexPrice: 1000
    });
    
    console.log(`Created buy order: ${buyResponse.data.id} for uneven index`);
    
    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get fill report
    const fillResponse = await axios.get(`${API_URL}/reporting/fill/uneven-buy-1`);
    console.log(`Fill report: ${JSON.stringify(fillResponse.data)}`);
    
    return {
      index: response.data,
      buyOrder: buyResponse.data,
      fillReport: fillResponse.data
    };
  } catch (error) {
    console.error(`Error in uneven weight index test: ${error.message}`);
    if (error.response) {
      console.error(`API Response: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * Test rebalance operation
 */
async function testRebalanceOperation(indexId = 'rebalance-test-index') {
  console.log('\n--- Testing Rebalance Operation ---');
  
  try {
    // Create a sample index first
    const sampleIndex = generateSampleIndex(indexId, 5);
    const indexPayload = {
      id: sampleIndex.id,
      assets: sampleIndex.assets.map(asset => ({
        id: asset.id,
        quantity: asset.quantity,
        price: asset.initialPrice
      }))
    };
    
    await axios.post(`${API_URL}/indices`, indexPayload);
    console.log(`Created index: ${indexPayload.id} for rebalance testing`);
    
    // Create a rebalance order
    const rebalanceResponse = await axios.post(`${API_URL}/orders/rebalance`, {
      indexId: indexId
    });
    
    console.log(`Created rebalance order: ${rebalanceResponse.data.id}`);
    
    // Wait for rebalance to process
    console.log('Waiting for rebalance to process...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Get rebalance report
    const rebalanceReport = await axios.get(`${API_URL}/reporting/rebalance/${indexId}`);
    console.log(`Rebalance report: ${JSON.stringify(rebalanceReport.data)}`);
    
    // Get updated index
    const updatedIndex = await axios.get(`${API_URL}/indices/${indexId}`);
    console.log(`Updated index price after rebalance: ${updatedIndex.data.currentPrice}`);
    
    return {
      rebalanceOrder: rebalanceResponse.data,
      rebalanceReport: rebalanceReport.data,
      updatedIndex: updatedIndex.data
    };
  } catch (error) {
    console.error(`Error in rebalance operation test: ${error.message}`);
    if (error.response) {
      console.error(`API Response: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * Test fill reporting
 */
async function testFillReporting(positionId = 'fill-report-test-1') {
  console.log('\n--- Testing Fill Reporting ---');
  
  try {
    // Create a sample index first
    const sampleIndex = generateSampleIndex('fill-report-index', 5);
    const indexPayload = {
      id: sampleIndex.id,
      assets: sampleIndex.assets.map(asset => ({
        id: asset.id,
        quantity: asset.quantity,
        price: asset.initialPrice
      }))
    };
    
    await axios.post(`${API_URL}/indices`, indexPayload);
    console.log(`Created index: ${indexPayload.id} for fill reporting testing`);
    
    // Create a buy order
    const buyResponse = await axios.post(`${API_URL}/orders/buy`, {
      positionId: positionId,
      indexId: 'fill-report-index',
      quantity: 1,
      indexPrice: sampleIndex.getCurrentPrice()
    });
    
    console.log(`Created buy order: ${buyResponse.data.id}`);
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get fill report
    const fillReport = await axios.get(`${API_URL}/reporting/fill/${positionId}`);
    console.log(`Fill report: ${JSON.stringify(fillReport.data)}`);
    
    return {
      buyOrder: buyResponse.data,
      fillReport: fillReport.data
    };
  } catch (error) {
    console.error(`Error in fill reporting test: ${error.message}`);
    if (error.response) {
      console.error(`API Response: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * Test rebalance reporting
 */
async function testRebalanceReporting(indexId = 'rebalance-report-index') {
  console.log('\n--- Testing Rebalance Reporting ---');
  
  try {
    // Create a sample index first
    const sampleIndex = generateSampleIndex(indexId, 5);
    const indexPayload = {
      id: sampleIndex.id,
      assets: sampleIndex.assets.map(asset => ({
        id: asset.id,
        quantity: asset.quantity,
        price: asset.initialPrice
      }))
    };
    
    await axios.post(`${API_URL}/indices`, indexPayload);
    console.log(`Created index: ${indexPayload.id} for rebalance reporting testing`);
    
    // Create a rebalance order
    const rebalanceResponse = await axios.post(`${API_URL}/orders/rebalance`, {
      indexId: indexId
    });
    
    console.log(`Created rebalance order: ${rebalanceResponse.data.id}`);
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Get rebalance report
    const rebalanceReport = await axios.get(`${API_URL}/reporting/rebalance/${indexId}`);
    console.log(`Rebalance report: ${JSON.stringify(rebalanceReport.data)}`);
    
    return {
      rebalanceOrder: rebalanceResponse.data,
      rebalanceReport: rebalanceReport.data
    };
  } catch (error) {
    console.error(`Error in rebalance reporting test: ${error.message}`);
    if (error.response) {
      console.error(`API Response: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * Run all tests in sequence
 */
async function runTests() {
  try {
    console.log('Starting ETF solver integration tests...\n');
    
    // Run tests in sequence
    const results = {
      indexCreation: await testIndexCreation(),
      orderOperations: await testOrderOperations(),
      unevenWeightIndex: await testUnevenWeightIndex(),
      rebalanceOperation: await testRebalanceOperation(),
      fillReporting: await testFillReporting(),
      rebalanceReporting: await testRebalanceReporting()
    };
    
    console.log('\n=== Integration Tests Completed ===');
    
    return results;
  } catch (error) {
    console.error(`Test suite failed: ${error.message}`);
    return { error: error.message };
  }
}

// Run the tests
runTests();