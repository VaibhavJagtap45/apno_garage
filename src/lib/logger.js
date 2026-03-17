// src/lib/logger.js
const winston = require("winston");
const { env } = require("../config/env");

const logger = winston.createLogger({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    env.NODE_ENV === "production"
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...rest }) => {
            // convert object message to JSON
            const msg =
              typeof message === "object"
                ? JSON.stringify(message, null, 2)
                : message;

            const meta = Object.keys(rest).length
              ? " " + JSON.stringify(rest, null, 2)
              : "";

            return `${timestamp} [${level}]: ${msg}${meta}`;
          }),
        ),
  ),
  transports: [new winston.transports.Console()],
});

module.exports = { logger };
