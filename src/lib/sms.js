// src/lib/sms.js
const axios = require("axios");
const { env } = require("../config/env");
const { logger } = require("./logger");

async function sendOtpSms(phone, otp, userName = "") {
  // message should match your DLT-approved template in production
  const message = `Your GarBlaz login OTP is ${otp}. It expires in 5 minutes.`;

  if (!env.FAST2SMS_API_KEY) {
    const err = new Error("FAST2SMS_API_KEY not configured");
    logger.error({ type: "OTP_SMS_FAILED", phone, error: err.message });
    throw err;
  }

  try {
    const resp = await axios.post(
      "https://www.fast2sms.com/dev/bulkV2",
      {
        route: "q",
        message,
        language: "english",
        numbers: phone, // without +91
      },
      {
        headers: {
          authorization: env.FAST2SMS_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 10_000,
      },
    );

    logger.info({ type: "OTP_SMS_SENT", phone, result: resp.data });
    return resp.data;
  } catch (err) {
    logger.error({
      type: "OTP_SMS_FAILED",
      phone,
      error: err.response?.data || err.message,
    });
    // bubble up useful message
    throw new Error(err.response?.data?.message || err.message || "SMS failed");
  }
}

module.exports = { sendOtpSms };
