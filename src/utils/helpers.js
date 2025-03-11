/**
 * Utility helper functions
 */

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @return {Promise} Promise that resolves after the specified time
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
};

/**
 * Format a number to a fixed precision
 * @param {number} value - The value to format
 * @param {number} precision - The decimal precision
 * @return {number} The formatted number
 */
const formatNumber = (value, precision = 8) => {
  return parseFloat(value.toFixed(precision));
};

/**
 * Calculate percentage difference between two values
 * @param {number} a - First value
 * @param {number} b - Second value
 * @return {number} Percentage difference
 */
const percentDifference = (a, b) => {
  if (a === 0 && b === 0) return 0;
  if (a === 0) return Infinity;
  return ((b - a) / Math.abs(a)) * 100;
};

/**
 * Group array elements by a key
 * @param {Array} array - The array to group
 * @param {Function} keyFn - Function to extract the key
 * @return {Object} Grouped object
 */
const groupBy = (array, keyFn) => {
  return array.reduce((result, item) => {
    const key = keyFn(item);
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(item);
    return result;
  }, {});
};

/**
 * Deep clone an object
 * @param {Object} obj - Object to clone
 * @return {Object} Cloned object
 */
const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Generate a unique ID
 * @param {string} prefix - Optional prefix
 * @return {string} Unique ID
 */
const generateId = (prefix = '') => {
  return `${prefix}${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
};

/**
 * Check if an order price is triggerable
 * @param {string} type - Order type ('buy' or 'sell')
 * @param {number} limitPrice - The order limit price
 * @param {number} currentPrice - The current market price
 * @return {boolean} Whether the order is triggerable
 */
const isOrderTriggerable = (type, limitPrice, currentPrice) => {
  if (type === 'buy') {
    return limitPrice >= currentPrice;
  } else if (type === 'sell') {
    return limitPrice <= currentPrice;
  }
  return false;
};

module.exports = {
  sleep,
  formatNumber,
  percentDifference,
  groupBy,
  deepClone,
  generateId,
  isOrderTriggerable
};
