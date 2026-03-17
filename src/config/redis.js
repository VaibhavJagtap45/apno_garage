// src/config/redis.js
const Redis = require("ioredis");
const { env } = require("./env");
const { logger } = require("../lib/logger");

const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: false,
});

redis.on("connect", () => {
  logger.info({ type: "REDIS_CONNECTED" });
  console.log("✅ Redis connected");
});

redis.on("error", (err) => {
  logger.error({ type: "REDIS_ERROR", error: err.message });
  console.log("⚠ Redis error:", err.message);
});

module.exports = { redis };
