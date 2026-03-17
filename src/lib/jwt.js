// src/lib/jwt.js
// Rotating refresh tokens stored hashed in MongoDB

const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { RefreshToken, GarageUser } = require("../models");
const { env } = require("../config/env");

// ─── Access token ─────────────────────────────────────────────────────────────
function signAccessToken(payload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

// ─── Refresh token ────────────────────────────────────────────────────────────
function generateRefreshTokenValue() {
  return crypto.randomBytes(48).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function issueRefreshToken(userId) {
  const rawToken = generateRefreshTokenValue();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(
    Date.now() + parseDuration(env.JWT_REFRESH_EXPIRES),
  );
  await RefreshToken.create({ userId, tokenHash, expiresAt });
  return rawToken;
}

async function rotateRefreshToken(rawToken) {
  const tokenHash = hashToken(rawToken);
  const stored = await RefreshToken.findOne({ tokenHash }).populate("userId");

  if (!stored || stored.isRevoked || stored.expiresAt < new Date()) {
    // Potential token reuse — revoke ALL tokens for user
    if (stored) {
      await RefreshToken.updateMany(
        { userId: stored.userId },
        { isRevoked: true },
      );
    }
    throw new Error("Invalid or expired refresh token");
  }

  const user = await GarageUser.findById(stored.userId);
  if (!user) throw new Error("User not found");

  const newToken = generateRefreshTokenValue();
  const newHash = hashToken(newToken);
  const expiresAt = new Date(
    Date.now() + parseDuration(env.JWT_REFRESH_EXPIRES),
  );

  // Revoke old, create new (two separate ops — Mongo doesn't have multi-doc atomic tx by default)
  await stored.updateOne({ isRevoked: true, replacedBy: newHash });
  await RefreshToken.create({
    userId: user._id,
    tokenHash: newHash,
    expiresAt,
  });

  const payload = {
    userId: user._id.toString(),
    garageId: user.garageId.toString(),
    role: user.role,
    tokenVersion: user.tokenVersion,
  };

  return { newRawToken: newToken, payload };
}

async function revokeRefreshToken(rawToken) {
  const tokenHash = hashToken(rawToken);
  await RefreshToken.updateMany(
    { tokenHash, isRevoked: false },
    { isRevoked: true },
  );
}

async function revokeAllRefreshTokens(userId) {
  await RefreshToken.updateMany(
    { userId, isRevoked: false },
    { isRevoked: true },
  );
  await GarageUser.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } });
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function parseDuration(str) {
  const unit = str.slice(-1);
  const n = parseInt(str.slice(0, -1), 10);
  const map = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * (map[unit] ?? 1_000);
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
};
