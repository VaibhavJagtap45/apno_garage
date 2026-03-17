const { generateOtp } = require("../utils/generateOtp");
const { sendSMS } = require("../services/fast2sms");

// Redis or DB
const otpStore = {};

exports.sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ message: "Phone required" });
    }

    const otp = generateOtp();

    // Save OTP
    otpStore[phone] = {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };

    // 🧪 DEVELOPMENT MODE
    if (process.env.NODE_ENV === "development") {
      console.log(`📱 DEV OTP for ${phone}: ${otp}`);

      return res.status(200).json({
        message: "OTP generated (dev mode)",
        otp, // only for dev
      });
    }

    // 🚀 PRODUCTION MODE → Fast2SMS
    const message = `Your OTP is ${otp}. It is valid for 5 minutes.`;

    await sendSMS(phone, message);

    return res.status(200).json({
      message: "OTP sent successfully",
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to send OTP" });
  }
};
