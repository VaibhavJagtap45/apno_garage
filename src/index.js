// src/index.js
require("dotenv").config();
const { env } = require("./config/env");
const { connectDB } = require("./config/db");
const { redis } = require("./config/redis");
const { createServer } = require("./server");
const { startWorkers } = require("./jobs");
const { logger } = require("./lib/logger");

async function main() {
  try {
    console.log("Connecting MongoDB...");
    await connectDB();
    console.log("✅ MongoDB connected");

    // Redis (ioredis auto connects)
    console.log("✅ Redis initializing...");

    // Create Express app
    const app = await createServer();

    // Start BullMQ workers
    try {
      startWorkers();
      console.log("✅ Workers started");
    } catch (err) {
      console.log("⚠ Workers disabled (Redis issue)");
    }

    logger.info({ type: "WORKERS_STARTED" });

    // Start HTTP server
    // app.listen(env.PORT, () => {
    //   logger.info({
    //     type: "SERVER_STARTED",
    //     url: `http://localhost:${env.PORT}`,
    //   });
    const PORT = process.env.PORT || env.PORT || 4000;

    app.listen(PORT, () => {
      console.log(`🚀 Server running on ${PORT}`);
    });

    //   console.log(`🚀 Server is listening on http://localhost:${env.PORT}`);
    //   console.log(`Health: http://localhost:${env.PORT}/health`);
    //   console.log(`Metrics: http://localhost:${env.PORT}/metrics`);
    // });
  } catch (err) {
    logger.error({
      type: "STARTUP_FAILED",
      message: err.message,
      stack: err.stack,
    });

    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info({ type: "GRACEFUL_SHUTDOWN" });
  process.exit(0);
});

main();
