'use strict';

/**
 * Contract rules from storj-lib (https://github.com/internxt/core)
 *
 * Rules: https://github.com/internxt/core/blob/5879f682cf24e3a1f861e61ff505c89e73ccccb8/lib/contract/schema.json
 * Error: https://github.com/internxt/core/blob/5879f682cf24e3a1f861e61ff505c89e73ccccb8/lib/contract/index.js#L52
 */

const assert = require('assert');

const isType = {
  // https://github.com/bugventure/jsen/blob/9e57a9d653ff4ea47d364fc37da0f1659bfb8e89/lib/jsen.js#L67
  integer: (value) => typeof value === 'number' && !(value % 1),
  string: (value) => typeof value === 'string',
  boolean: (value) => typeof value === 'boolean',
  null: (value) => value === null,
};

const rule = (types, { minimum, maximum, pattern } = {}) => (value) => {
  if (!types.some((type) => isType[type](value))) {
    return false;
  }
  if (value < minimum || value > maximum) {
    return false;
  }

  return typeof value !== 'string' || pattern === undefined || pattern.test(value);
};

const text = rule(['string', 'null']);
const price = rule(['integer', 'null']);
const positiveNumber = rule(['integer', 'null'], { minimum: 0 });
const nodeId = rule(['string', 'null'], { pattern: /[A-Fa-f0-9]{40}$/ });

const CONTRACT_RULES = {
  version: rule(['integer'], { minimum: 0 }),
  renter_hd_key: rule(['string', 'boolean'], { pattern: /^[1-9a-km-zA-HJ-NP-Z]{1,111}$/ }),
  renter_hd_index: rule(['integer', 'boolean'], { minimum: 0, maximum: 2147483647 }),
  renter_id: nodeId,
  renter_signature: text,
  farmer_id: nodeId,
  farmer_signature: text,
  data_size: positiveNumber,
  data_hash: rule(['string', 'null'], { pattern: /^[0-9a-f]{40}$/ }),
  store_begin: positiveNumber,
  store_end: positiveNumber,
  audit_count: positiveNumber,
  payment_storage_price: price,
  payment_download_price: price,
  payment_destination: text,
};

const validateContract = (contract) => {
  const properties = Object(contract);
  const isValid = Object.keys(CONTRACT_RULES).every((field) => (
    properties[field] === undefined || CONTRACT_RULES[field](properties[field])
  ));

  assert.ok(isValid, 'Invalid contract specification was supplied');
};

module.exports = { validateContract };
