const app = require('./app');
const config = require('./config');
const { connectDb } = require('./db');

async function start() {
  try {
    await connectDb();
    console.log(`[db] Connected to MongoDB Atlas (${config.mongoDb})`);
    app.listen(config.port, () => {
      console.log(`[server] SecureFile API listening on http://localhost:${config.port}`);
      console.log(`[server] Allowed origin: ${config.clientOrigin}`);
    });
  } catch (err) {
    console.error('[fatal] Unable to start server:', err.message);
    process.exit(1);
  }
}

start();
