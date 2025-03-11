/**
 * Tests for ETF solver reporting functionality
 */
const axios = require('axios');
const { generateSampleIndex } = require('./mockData');

// Base URL for API
const API_URL = 'http://localhost:5000/api';

/**
 * Test fill reporting
 */
async function testFillReporting() {
  console.log('--- Testing Fill Reporting ---');
  
  try {
    // Create a sample index
    const sampleIndex = generateSampleIndex('reporting-index', 5);
    const indexPayload = {
      id: sampleIndex.id,
      assets: sampleIndex.assets.map(asset => ({
        id: asset.id,
        quantity: asset.quantity,
        price: asset.initialPrice
      }))
    };
    
    const indexResponse = await axios.post(`${API_URL}/indices`, indexPayload);
    console.log(`Created index: ${indexResponse.data.id} with ${indexResponse.data.assets.length} assets`);
    
    // Create multiple buy orders
    console.log('Creating buy orders for testing fill reporting...');
    
    const buyResponses = await Promise.all([
      axios.post(`${API_URL}/orders/buy`, {
        positionId: 'fill-test-1',
        indexId: sampleIndex.id,
        quantity: 1,
        indexPrice: sampleIndex.getCurrentPrice()
      }),
      axios.post(`${API_URL}/orders/buy`, {
        positionId: 'fill-test-2',
        indexId: sampleIndex.id,
        quantity: 0.5,
        indexPrice: sampleIndex.getCurrentPrice() * 0.95 // Below current price, should not trigger
      }),
      axios.post(`${API_URL}/orders/buy`, {
        positionId: 'fill-test-3',
        indexId: sampleIndex.id,
        quantity: 2,
        indexPrice: sampleIndex.getCurrentPrice() * 1.05 // Above current price, should trigger
      })
    ]);
    
    console.log(`Created ${buyResponses.length} buy orders for fill testing`);
    
    // Wait a bit for processing
    console.log('Waiting for 3 seconds to allow processing...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Get fill reports for each position
    console.log('\nRetrieving fill reports for all positions:');
    
    const fillReports = await Promise.all([
      axios.get(`${API_URL}/reporting/fill/fill-test-1`),
      axios.get(`${API_URL}/reporting/fill/fill-test-2`), 
      axios.get(`${API_URL}/reporting/fill/fill-test-3`)
    ]);
    
    // Log fill report details
    fillReports.forEach((report, index) => {
      console.log(`\nPosition fill-test-${index+1} report:`);
      console.log(JSON.stringify(report.data, null, 2));
    });
    
    // Now let's cancel one of the orders
    console.log('\nCancelling order fill-test-2...');
    
    const cancelResponse = await axios.post(`${API_URL}/orders/cancel`, {
      positionId: 'fill-test-2'
    });
    
    console.log(`Cancel order created with ID: ${cancelResponse.data.id}`);
    
    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Get fill report after cancel
    const cancelFillReport = await axios.get(`${API_URL}/reporting/fill/fill-test-2`);
    console.log('\nFill report after cancellation:');
    console.log(JSON.stringify(cancelFillReport.data, null, 2));
    
    return {
      fillReports: fillReports.map(r => r.data),
      cancelReport: cancelFillReport.data
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
async function testRebalanceReporting() {
  console.log('\n--- Testing Rebalance Reporting ---');
  
  try {
    // Create a sample index
    const sampleIndex = generateSampleIndex('rebalance-index', 5);
    const indexPayload = {
      id: sampleIndex.id,
      assets: sampleIndex.assets.map(asset => ({
        id: asset.id,
        quantity: asset.quantity,
        price: asset.initialPrice
      }))
    };
    
    const indexResponse = await axios.post(`${API_URL}/indices`, indexPayload);
    console.log(`Created index: ${indexResponse.data.id} with ${indexResponse.data.assets.length} assets`);
    
    // Get initial rebalance report (should be empty)
    console.log('Getting initial rebalance report...');
    
    try {
      const initialRebalanceReport = await axios.get(`${API_URL}/reporting/rebalance/${sampleIndex.id}`);
      console.log('Initial rebalance report:');
      console.log(JSON.stringify(initialRebalanceReport.data, null, 2));
    } catch (error) {
      console.log(`Initial rebalance report error: ${error.message}`);
    }
    
    // Create a rebalance order
    console.log('Creating rebalance order...');
    
    const rebalanceResponse = await axios.post(`${API_URL}/orders/rebalance`, {
      indexId: sampleIndex.id
    });
    
    console.log(`Created rebalance order with ID: ${rebalanceResponse.data.id}`);
    
    // Wait for processing
    console.log('Waiting for 3 seconds to allow processing...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Get rebalance report
    const rebalanceReport = await axios.get(`${API_URL}/reporting/rebalance/${sampleIndex.id}`);
    console.log('Rebalance report after rebalance:');
    console.log(JSON.stringify(rebalanceReport.data, null, 2));
    
    // Now let's create a buy order after rebalance and see how it's affected
    console.log('\nCreating buy order after rebalance...');
    
    const buyResponse = await axios.post(`${API_URL}/orders/buy`, {
      positionId: 'rebalance-test-buy',
      indexId: sampleIndex.id,
      quantity: 1,
      indexPrice: 1000
    });
    
    console.log(`Created buy order with ID: ${buyResponse.data.id}`);
    
    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Get fill report for the buy order
    const fillReport = await axios.get(`${API_URL}/reporting/fill/rebalance-test-buy`);
    console.log('Fill report for buy order after rebalance:');
    console.log(JSON.stringify(fillReport.data, null, 2));
    
    return {
      rebalanceReport: rebalanceReport.data,
      buyFillReport: fillReport.data
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
 * Run all reporting tests
 */
async function runReportingTests() {
  try {
    console.log('Starting ETF solver reporting tests...\n');
    
    // Run fill reporting tests
    const fillResults = await testFillReporting();
    
    // Run rebalance reporting tests
    const rebalanceResults = await testRebalanceReporting();
    
    console.log('\n=== Reporting Tests Completed ===');
    
    return {
      fillReporting: fillResults,
      rebalanceReporting: rebalanceResults
    };
  } catch (error) {
    console.error(`Reporting tests failed: ${error.message}`);
    return { error: error.message };
  }
}

// Run the tests
runReportingTests();