// src/lib/otp.js
const crypto = require("crypto");
const axios = require("axios");
const { redis } = require("../config/redis");
const { env } = require("../config/env");
const { logger } = require("./logger");

// ================= CONFIG =================
const OTP_TTL = Number(env.OTP_TTL_SECONDS || 300); // 5 min
const OTP_MAX_ATTEMPTS = Number(env.OTP_MAX_ATTEMPTS || 5);
const OTP_PER_IP_MAX = Number(env.OTP_PER_IP_MAX || 10);
const OTP_PER_IP_WIN = Number(env.OTP_PER_IP_WINDOW || 600);

// ================= REDIS KEYS =================
const otpKey = (id) => `otp:value:${id}`;
const attemptsKey = (id) => `otp:attempts:${id}`;
const ipKey = (ip) => `otp:ip:${ip}`;

// ================= UTILS =================
function generateOTP(length = 6) {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashOtp(otp) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

// ================= RATE LIMIT =================
async function checkIPRateLimit(ip) {
  const key = ipKey(ip);
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, OTP_PER_IP_WIN);
  }

  return count <= OTP_PER_IP_MAX;
}

// ================= STORE OTP =================
async function storeOTP(identifier, otp) {
  const hashed = hashOtp(otp);

  await redis.set(otpKey(identifier), hashed, "EX", OTP_TTL);
  await redis.set(attemptsKey(identifier), "0", "EX", OTP_TTL);
}

// ================= VERIFY OTP =================
async function verifyOTP(identifier, otp) {
  const stored = await redis.get(otpKey(identifier));

  if (!stored) {
    return { ok: false, reason: "expired_or_missing" };
  }

  const attempts = parseInt(
    (await redis.get(attemptsKey(identifier))) || "0",
    10,
  );

  if (attempts >= OTP_MAX_ATTEMPTS) {
    await redis.del(otpKey(identifier), attemptsKey(identifier));
    return { ok: false, reason: "max_attempts" };
  }

  const hashed = hashOtp(otp);

  if (hashed !== stored) {
    await redis.incr(attemptsKey(identifier));
    return { ok: false, reason: "invalid" };
  }

  // ✅ success
  await redis.del(otpKey(identifier), attemptsKey(identifier));
  return { ok: true };
}

// ================= SEND SMS =================
async function sendSMS(phone, otp) {
  const message = `Your OTP is ${otp}. Valid for 5 minutes.`;

  return axios.post(
    "https://www.fast2sms.com/dev/bulkV2",
    {
      route: "q",
      message,
      language: "english",
      numbers: phone,
    },
    {
      headers: {
        authorization: env.FAST2SMS_API_KEY,
        "Content-Type": "application/json",
      },
    },
  );
}

// ================= MAIN FUNCTION =================
async function sendAndStoreOTP({ identifier, ip }) {
  try {
    // 🔒 IP rate limit
    if (!(await checkIPRateLimit(ip))) {
      return { ok: false, reason: "ip_rate_limited" };
    }

    const otp = generateOTP();

    await storeOTP(identifier, otp);

    // 🧪 DEV MODE
    if (env.NODE_ENV !== "production") {
      console.log(`📱 DEV OTP for ${identifier}: ${otp}`);

      return {
        ok: true,
        message: "OTP generated (dev mode)",
        otp, // only for testing
      };
    }

    // 🚀 PRODUCTION → Fast2SMS
    await sendSMS(identifier, otp);

    return {
      ok: true,
      message: "OTP sent successfully",
    };
  } catch (err) {
    logger.error({
      type: "OTP_SEND_FAILED",
      error: err.message,
      identifier,
    });

    await redis.del(otpKey(identifier));

    return {
      ok: false,
      reason: "send_failed",
      error: err.message,
    };
  }
}

// ================= EXPORTS =================
module.exports = {
  generateOTP,
  storeOTP,
  verifyOTP,
  sendAndStoreOTP, // ✅ THIS FIXES YOUR ERROR
};
