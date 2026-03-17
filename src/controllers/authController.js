// controllers/authController.js
const User = require("../models/User");
const { sendSms } = require("../services/smsService");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require("../utils/jwt");

const crypto = require("crypto");

function generateOtp(digits = 6) {
  const max = 10 ** digits;
  const num = Math.floor(Math.random() * max);
  return String(num).padStart(digits, "0");
}

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

// POST /api/auth/send-otp
// POST /api/auth/send-otp
async function sendOtp(req, res) {
  try {
    const { phone, name } = req.body;
    if (!phone) return res.status(400).json({ error: "phone required" });

    const otp = generateOtp(6);
    const otpExpiry = Date.now() + OTP_TTL_MS;

    // upsert user
    let user = await User.findOne({ phone }).exec();
    if (!user) {
      user = new User({ phone, name });
    }

    user.otp = otp;
    user.otpExpiry = new Date(otpExpiry);
    await user.save();

    // 🧪 DEVELOPMENT MODE (NO SMS COST)
    if (process.env.NODE_ENV === "development") {
      console.log(`📱 DEV OTP for ${phone}: ${otp}`);

      return res.json({
        ok: true,
        message: "OTP generated (dev mode)",
        otp, // only for testing
      });
    }

    // 🚀 PRODUCTION MODE → Fast2SMS
    const message = `Your verification OTP is ${otp}. It expires in 5 minutes.`;

    const response = await axios.post(
      "https://www.fast2sms.com/dev/bulkV2",
      {
        route: "q",
        message,
        language: "english",
        numbers: phone, // without +91
      },
      {
        headers: {
          authorization: process.env.FAST2SMS_API_KEY,
          "Content-Type": "application/json",
        },
      },
    );

    console.log("Fast2SMS Response:", response.data);

    return res.json({
      ok: true,
      message: "OTP sent successfully",
    });
  } catch (err) {
    console.error("sendOtp error", err.response?.data || err.message);

    return res.status(500).json({
      error: "Failed to send OTP",
      detail: err.response?.data || err.message,
    });
  }
}

// POST /api/auth/verify-otp
async function verifyOtp(req, res) {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp)
      return res.status(400).json({ error: "phone and otp required" });

    const user = await User.findOne({ phone }).exec();
    if (!user) return res.status(400).json({ error: "User not found" });

    if (!user.otp || !user.otpExpiry || user.otpExpiry < new Date()) {
      return res.status(400).json({ error: "OTP expired or not found" });
    }

    if (user.otp !== String(otp)) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    // OTP is valid — clear it and mark verified
    user.otp = null;
    user.otpExpiry = null;
    user.isVerified = true;

    // create tokens
    const payload = { sub: user._id.toString(), phone: user.phone };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    // store refresh token (in DB). In production store hashed version.
    user.refreshTokens = user.refreshTokens || [];
    user.refreshTokens.push({ token: refreshToken, createdAt: new Date() });

    await user.save();

    return res.json({
      ok: true,
      message: "Phone verified",
      accessToken,
      refreshToken,
      user: { id: user._id, phone: user.phone, name: user.name },
    });
  } catch (err) {
    console.error("verifyOtp error", err);
    return res.status(500).json({
      error: "Verification failed",
      detail: String(err.message || err),
    });
  }
}

// POST /api/auth/refresh
async function refreshToken(req, res) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken)
      return res.status(400).json({ error: "refreshToken required" });

    // verify token cryptographically
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (err) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    // ensure token exists in DB (not revoked)
    const user = await User.findById(payload.sub).exec();
    if (!user) return res.status(401).json({ error: "User not found" });

    const found = (user.refreshTokens || []).some(
      (rt) => rt.token === refreshToken,
    );
    if (!found) return res.status(401).json({ error: "Refresh token revoked" });

    // create new tokens
    const newAccess = signAccessToken({
      sub: user._id.toString(),
      phone: user.phone,
    });
    // optionally rotate refresh token (recommended)
    const newRefresh = signRefreshToken({
      sub: user._id.toString(),
      phone: user.phone,
    });

    // replace old refresh token with new one (rotation)
    user.refreshTokens = user.refreshTokens.filter(
      (rt) => rt.token !== refreshToken,
    );
    user.refreshTokens.push({ token: newRefresh, createdAt: new Date() });
    await user.save();

    return res.json({ accessToken: newAccess, refreshToken: newRefresh });
  } catch (err) {
    console.error("refreshToken error", err);
    return res.status(500).json({
      error: "Could not refresh token",
      detail: String(err.message || err),
    });
  }
}

// POST /api/auth/logout
async function logout(req, res) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken)
      return res.status(400).json({ error: "refreshToken required" });

    // verify token to get user id
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (err) {
      // still attempt to remove token by matching DB entry — decode without verifying?
      // but simplest: return success to avoid leaking info
      return res.status(200).json({ ok: true });
    }

    const user = await User.findById(payload.sub).exec();
    if (!user) return res.status(200).json({ ok: true });

    // remove the token
    user.refreshTokens = (user.refreshTokens || []).filter(
      (rt) => rt.token !== refreshToken,
    );
    await user.save();

    return res.json({ ok: true, message: "Logged out" });
  } catch (err) {
    console.error("logout error", err);
    return res.status(500).json({ error: "Logout failed" });
  }
}

module.exports = { sendOtp, verifyOtp, refreshToken, logout };
