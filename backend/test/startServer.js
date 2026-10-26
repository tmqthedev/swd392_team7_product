// Offline compose smoke test entrypoint. Production always uses src/server.js.
const { start } = require('../src/server');
start().catch((error) => { console.error(error); process.exit(1); });
