// src/config/db.js
const mongoose = require('mongoose');
const { env } = require('./env');
const { logger } = require('../lib/logger');

async function connectDB() {
  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    logger.info({ type: 'DB_CONNECTED', uri: env.MONGODB_URI.replace(/\/\/.*@/, '//***@') });
  } catch (err) {
    logger.error({ type: 'DB_CONNECTION_FAILED', error: err.message });
    process.exit(1);
  }

  mongoose.connection.on('disconnected', () => {
    logger.warn({ type: 'DB_DISCONNECTED' });
  });

  mongoose.connection.on('error', (err) => {
    logger.error({ type: 'DB_ERROR', error: err.message });
  });
}

module.exports = { connectDB };
