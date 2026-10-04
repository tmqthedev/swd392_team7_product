// uuid@13 is ESM-only, Jest (CommonJS) can't require it -> mapped here via jest.config.js
const { randomUUID } = require('crypto');

module.exports = {
  v4: () => randomUUID(),
};
