const { createApp } = require('./app');
const env = require('./config/env');

const app = createApp();

app.listen(env.port, () => {
  process.stdout.write(`Backend API listening on port ${env.port}\n`);
});
