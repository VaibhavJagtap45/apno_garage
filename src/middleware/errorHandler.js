// src/middleware/errorHandler.js
const { logger } = require('../lib/logger');
const { env }    = require('../config/env');

class AppError extends Error {
  constructor(message, statusCode = 400, code = 'BAD_REQUEST') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

class NotFoundError    extends AppError { constructor(m) { super(m, 404, 'NOT_FOUND'); } }
class ForbiddenError   extends AppError { constructor(m) { super(m, 403, 'FORBIDDEN'); } }
class UnauthorizedError extends AppError { constructor(m) { super(m, 401, 'UNAUTHENTICATED'); } }
class ValidationError  extends AppError { constructor(m) { super(m, 422, 'VALIDATION_ERROR'); } }
class ConflictError    extends AppError { constructor(m) { super(m, 409, 'CONFLICT'); } }

function errorHandler(err, req, res, next) {
  const status = err.statusCode ?? 500;
  const code   = err.code ?? 'INTERNAL_SERVER_ERROR';

  if (status >= 500) {
    logger.error({ type: 'UNHANDLED_ERROR', error: err.message, stack: err.stack, path: req.path });
  } else {
    logger.warn({ type: 'REQUEST_ERROR', code, error: err.message, path: req.path });
  }

  if (env.NODE_ENV === 'production' && status >= 500) {
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
  }

  res.status(status).json({ error: err.message, code });
}

module.exports = { errorHandler, AppError, NotFoundError, ForbiddenError, UnauthorizedError, ValidationError, ConflictError };
