// src/server.js
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const client   = require('prom-client');
const { env }  = require('./config/env');
const { logger } = require('./lib/logger');
const { attachUser } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');

// ─── Prometheus ───────────────────────────────────────────────────────────────
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name:       'http_request_duration_seconds',
  help:       'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets:    [0.01, 0.05, 0.1, 0.3, 1, 3, 10],
  registers:  [register],
});

async function createServer() {
  const app = express();

  // ─── Security ──────────────────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy:     env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: false,
  }));

  app.use(cors({
    origin:      env.CLIENT_URL,
    credentials: true,
  }));

  // ─── Body parsing ──────────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ─── Request logging ───────────────────────────────────────────────────────
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.info(msg.trim()) },
    skip:   (req) => req.path === '/health' || req.path === '/metrics',
  }));

  // ─── Request timing ────────────────────────────────────────────────────────
  app.use((req, res, next) => {
    const end = httpRequestDuration.startTimer({ method: req.method, route: req.path });
    res.on('finish', () => end({ status_code: res.statusCode }));
    next();
  });

  // ─── Request ID ────────────────────────────────────────────────────────────
  app.use((req, res, next) => {
    req.requestId = req.headers['x-request-id'] ?? require('crypto').randomUUID();
    res.setHeader('x-request-id', req.requestId);
    next();
  });

  // ─── Auth (attach user to all requests) ───────────────────────────────────
  app.use(attachUser);

  // ─── Health & Metrics ──────────────────────────────────────────────────────
  app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  // ─── API Routes ────────────────────────────────────────────────────────────
  app.use('/api/auth', require('./routes/auth.routes'));
  app.use('/api',      require('./routes'));

  // ─── 404 ───────────────────────────────────────────────────────────────────
  app.use((req, res) => res.status(404).json({ error: 'Route not found', code: 'NOT_FOUND' }));

  // ─── Error handler ─────────────────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}

module.exports = { createServer };
