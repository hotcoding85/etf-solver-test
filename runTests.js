/**
 * Test runner for ETF solver integration tests, edge cases, and reporting tests
 */
const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

// Main function to run tests
async function main() {
  console.log('ETF Solver Test Suite');
  console.log('====================');
  
  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log('\nSelect test type:');
  console.log('1) Integration Tests (Basic functionality)');
  console.log('2) Edge Case Tests (Extreme scenarios)');
  console.log('3) Reporting Tests (Fill and rebalance reporting)');
  console.log('4) Run All Tests');
  console.log('5) Custom Test Sequence');
  
  rl.question('\nEnter your choice (1-5): ', async (answer) => {
    try {
      switch (answer.trim()) {
        case '1':
          await runIntegrationTests();
          break;
        case '2':
          await runEdgeCaseTests();
          break;
        case '3':
          await runReportingTests();
          break;
        case '4':
          await runAllTests();
          break;
        case '5':
          await customTestSequence(rl);
          return; // Don't close rl yet
        default:
          console.log('Invalid choice. Running integration tests by default.');
          await runIntegrationTests();
      }
      
      console.log('\nAll tests completed.');
      rl.close();
    } catch (error) {
      console.error(`\nTest execution failed: ${error.message}`);
      rl.close();
      process.exit(1);
    }
  });
}

// Run integration tests
async function runIntegrationTests() {
  console.log('\nStarting ETF solver integration tests...');
  
  try {
    await runNodeScript('./tests/integrationTest.js');
    console.log('Integration tests completed successfully');
    return true;
  } catch (error) {
    console.error(`Error running integration tests: ${error.message}`);
    return false;
  }
}

// Run edge case tests
async function runEdgeCaseTests() {
  console.log('\nStarting ETF solver edge case tests...');
  
  try {
    await runNodeScript('./tests/edgeCaseTests.js');
    console.log('Edge case tests completed successfully');
    return true;
  } catch (error) {
    console.error(`Error running edge case tests: ${error.message}`);
    return false;
  }
}

// Run reporting tests
async function runReportingTests() {
  console.log('\nStarting ETF solver reporting tests...');
  
  try {
    await runNodeScript('./tests/reportingTest.js');
    console.log('Reporting tests completed successfully');
    return true;
  } catch (error) {
    console.error(`Error running reporting tests: ${error.message}`);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('\n=== Running Complete Test Suite ===');
  
  const results = [
    await runIntegrationTests(),
    await runSeparator(),
    await runEdgeCaseTests(),
    await runSeparator(),
    await runReportingTests()
  ];
  
  const success = results.filter(r => typeof r === 'boolean').every(r => r === true);
  
  console.log(`\n=== Complete Test Suite ${success ? 'PASSED' : 'FAILED'} ===`);
  
  return success;
}

// Custom test sequence
async function customTestSequence(rl) {
  console.log('\n=== Custom Test Sequence ===');
  console.log('Select tests to run in sequence:');
  console.log('a) Integration Tests');
  console.log('b) Edge Case Tests');
  console.log('c) Reporting Tests');
  console.log('x) Exit');
  
  const sequence = [];
  
  const addTest = () => {
    rl.question('\nAdd test to sequence (a/b/c) or run sequence (x): ', async (choice) => {
      const trimmedChoice = choice.trim().toLowerCase();
      
      if (trimmedChoice === 'x') {
        if (sequence.length === 0) {
          console.log('No tests selected. Exiting.');
          rl.close();
          return;
        }
        
        // Run the sequence
        console.log(`\nRunning custom sequence: ${sequence.join(' -> ')}`);
        
        try {
          for (let i = 0; i < sequence.length; i++) {
            const test = sequence[i];
            
            switch (test) {
              case 'Integration':
                await runIntegrationTests();
                break;
              case 'Edge Case':
                await runEdgeCaseTests();
                break;
              case 'Reporting':
                await runReportingTests();
                break;
            }
            
            if (i < sequence.length - 1) {
              await runSeparator();
            }
          }
          
          console.log('\nCustom test sequence completed.');
        } catch (error) {
          console.error(`\nCustom test sequence failed: ${error.message}`);
        }
        
        rl.close();
        return;
      }
      
      switch (trimmedChoice) {
        case 'a':
          sequence.push('Integration');
          console.log(`Added Integration Tests to sequence. Current sequence: ${sequence.join(' -> ')}`);
          addTest();
          break;
        case 'b':
          sequence.push('Edge Case');
          console.log(`Added Edge Case Tests to sequence. Current sequence: ${sequence.join(' -> ')}`);
          addTest();
          break;
        case 'c':
          sequence.push('Reporting');
          console.log(`Added Reporting Tests to sequence. Current sequence: ${sequence.join(' -> ')}`);
          addTest();
          break;
        default:
          console.log('Invalid choice. Try again.');
          addTest();
      }
    });
  };
  
  addTest();
}

// Print separator
async function runSeparator() {
  console.log('\n' + '-'.repeat(50) + '\n');
  return true;
}

// Helper function to run a Node.js script
function runNodeScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const fullPath = path.resolve(scriptPath);
    console.log(`Executing script: ${fullPath}`);
    
    const child = spawn('node', [fullPath], {
      stdio: 'inherit'
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });
    
    child.on('error', (err) => {
      reject(err);
    });
  });
}

// Run the main function
main().catch(error => {
  console.error(`Unhandled error: ${error.message}`);
  process.exit(1);
});