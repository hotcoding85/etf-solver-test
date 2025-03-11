# ETF Solver Backend Test

A Node.js backend system for ETF index trading with order queue management and execution algorithms.

## Getting Started

### Installation

1. Clone the repository:
```bash
git clone https://github.com/hotcoding85/etf-solver-test.git
cd etf-solver-test
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
node src/index.js
```

The server will start at http://localhost:5000 by default.

## Running Tests

The project includes several test suites that can be run using the test runner:

```bash
# Run specific test suite
echo "1" | node runTests.js  # Integration tests
echo "2" | node runTests.js  # Edge case tests
echo "3" | node runTests.js  # Reporting tests

# Run all tests
echo "4" | node runTests.js
```

## API Endpoints

### Index Management

- **POST /api/indices**: Create a new index
  ```json
  {
    "id": "sample-index",
    "assets": [
      {"id": "BTC", "quantity": 0.01, "price": 40000},
      {"id": "ETH", "quantity": 0.1, "price": 3000}
    ]
  }
  ```

- **GET /api/indices**: Get all indices
- **GET /api/indices/:id**: Get a specific index
- **PUT /api/indices/:indexId/assets/:assetId/price**: Update an asset price
  ```json
  {
    "price": 42000
  }
  ```
- **DELETE /api/indices/:id**: Delete an index

### Order Management

- **POST /api/orders/buy**: Create a buy order
  ```json
  {
    "positionId": "position-123",
    "indexId": "sample-index",
    "quantity": 1.5,
    "indexPrice": 1000
  }
  ```

- **POST /api/orders/sell**: Create a sell order
  ```json
  {
    "positionId": "position-456",
    "indexId": "sample-index",
    "quantity": 0.5,
    "indexPrice": 1020
  }
  ```

- **POST /api/orders/cancel**: Cancel an order
  ```json
  {
    "positionId": "position-123"
  }
  ```

- **POST /api/orders/rebalance**: Rebalance an index
  ```json
  {
    "indexId": "sample-index"
  }
  ```

### Position Management

- **GET /api/positions**: Get all positions
- **GET /api/positions/:id**: Get a specific position

### Reporting

- **GET /api/reporting/fill/:positionId**: Get fill report for a position
- **GET /api/reporting/rebalance/:indexId**: Get rebalance history for an index

### Queue Status

- **GET /api/queue/status**: Get current queue status

## Key Features

### Rate Limiting
- Respects Binance's 100 orders per 10 seconds limit
- Prioritizes orders (cancel > rebalance > buy/sell)
- Batches orders for optimal processing

### Liquidity Analysis
- Analyzes order books to optimize execution
- Determines fill percentages for partial orders
- Prioritizes orders based on available liquidity

### Order Processing
- Supports buy, sell, cancel, and rebalance operations
- Tracks order lifecycle from submission to completion
- Provides detailed status updates

### Index Management
- Supports indices with 10-100 assets
- Handles uneven weighted indices
- Tracks asset prices and quantities

### Rebalancing
- Performs periodic index rebalancing
- Calculates and executes required asset changes
- Provides detailed rebalance history

### Testing Coverage
- Integration tests verify basic functionality
- Edge case tests handle extreme scenarios
- Reporting tests verify data integrity

## System Requirements

- Handles Binance rate limit (100 orders/10 seconds)
- Supports minimum buy amount of $5 per asset
- Processes high-frequency trading operations
- Handles extreme price changes and uneven weights

## Project Structure

```
etf-solver/
├── src/                  # Source code
│   ├── models/           # Data models (Asset, Index, Order)
│   ├── services/         # Business logic services
│   ├── utils/            # Utility functions
│   └── index.js          # Application entry point
├── tests/                # Tests
├── runTests.js           # Test runner
└── README.md             # Project documentation
```