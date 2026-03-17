// src/middleware/auth.js

const { verifyAccessToken } = require("../lib/jwt");
const { GarageUser } = require("../models");
const { logger } = require("../lib/logger");

/**
 * Middleware
 * Attaches req.user if a valid Bearer token is present.
 * Does NOT block unauthenticated requests.
 */
async function attachUser(req, res, next) {
  // Skip auth routes (login / otp / refresh)
  if (req.path.startsWith("/api/auth")) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  try {
    const token = authHeader.split(" ")[1];

    const payload = verifyAccessToken(token);

    const dbUser = await GarageUser.findById(payload.userId).select(
      "tokenVersion isActive",
    );

    if (!dbUser || !dbUser.isActive) {
      return next();
    }

    if (dbUser.tokenVersion !== payload.tokenVersion) {
      logger.warn({
        type: "TOKEN_VERSION_MISMATCH",
        userId: payload.userId,
      });

      return next();
    }

    req.user = payload;
  } catch (err) {}

  next();
}

/**
 * Require authentication
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: "Unauthorized",
      code: "UNAUTHENTICATED",
    });
  }

  next();
}

/**
 * Ensure user can access specific garage
 */
function requireGarageAccess(req, res, next) {
  const resourceGarageId = req.params.garageId || req.body.garageId;

  if (resourceGarageId && req.user?.garageId !== resourceGarageId) {
    return res.status(403).json({
      error: "Forbidden",
      code: "FORBIDDEN",
    });
  }

  next();
}

/**
 * Role-based access control
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Insufficient permissions",
      });
    }

    next();
  };
}

module.exports = {
  attachUser,
  requireAuth,
  requireGarageAccess,
  requireRole,
};
