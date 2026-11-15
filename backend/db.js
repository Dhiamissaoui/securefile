const mongoose = require('mongoose');
const config = require('./config');

async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri, {
    dbName: config.mongoDb,
    serverSelectionTimeoutMS: 12000,
    maxPoolSize: 5,
  });
  const models = ['User', 'File', 'Share', 'Certificate', 'AuditLog', 'Session', 'Counter'];
  await Promise.all(models.map((m) => require(`./models/${m}`).init()));
  return mongoose.connection;
}

module.exports = { connectDb };
