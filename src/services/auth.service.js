// // src/services/auth.service.js
// const { GarageUser } = require("../models");
// const {
//   generateOTP,
//   storeOTP,
//   verifyOTP,
//   checkEmailRateLimit,
//   checkIPRateLimit,
// } = require("../lib/otp");
// const {
//   signAccessToken,
//   issueRefreshToken,
//   rotateRefreshToken,
//   revokeRefreshToken,
//   revokeAllRefreshTokens,
// } = require("../lib/jwt");
// const { sendOtpEmail } = require("../lib/email");
// const { AppError, UnauthorizedError } = require("../middleware/errorHandler");
// const { env } = require("../config/env");
// const { logger } = require("../lib/logger");

// class AuthService {
//   // ── Step 1: Request OTP ───────────────────────────────────────────────────
//   static async requestOtp(email, ip) {
//     const emailOk = await checkEmailRateLimit(email);
//     const ipOk = await checkIPRateLimit(ip);
//     if (!emailOk)
//       throw new AppError("Too many OTP requests. Try again later.", 429);
//     if (!ipOk) throw new AppError("Too many requests from this IP.", 429);

//     const user = await GarageUser.findOne({ email, isActive: true });
//     // Security: don't reveal whether email exists in production
//     if (!user) {
//       if (env.NODE_ENV !== "production") {
//         return {
//           success: false,
//           message: `No active user found with email: ${email}`,
//         };
//       }
//       return {
//         success: true,
//         message: "If this email is registered, an OTP has been sent.",
//       };
//     }

//     const otp = generateOTP();
//     await storeOTP(email, otp);

//     // Always log OTP in dev — useful even if email sending works
//     if (env.NODE_ENV !== "production") {
//       logger.info({ type: "DEV_OTP", email, otp });
//       console.log(`\n┌─────────────────────────────────┐`);
//       console.log(`│  DEV OTP for ${email}`);
//       console.log(`│  OTP: ${otp}`);
//       console.log(`└─────────────────────────────────┘\n`);
//     }

//     // Try sending real email; in dev, failure is non-fatal
//     try {
//       await sendOtpEmail(email, otp, user.name);
//       logger.info({ type: "OTP_SENT", email });

//       if (env.NODE_ENV !== "production") {
//         return { success: true, message: "OTP sent to your email.", otp }; // include otp in dev
//       }
//       return { success: true, message: "OTP sent to your email." };
//     } catch (emailErr) {
//       logger.warn({ type: "OTP_EMAIL_FAILED", error: emailErr.message });

//       if (env.NODE_ENV !== "production") {
//         // Email failed but OTP is stored — still usable via console log
//         return {
//           success: true,
//           message:
//             "Email sending failed (dev mode). Use the OTP from console logs.",
//           otp, // always return in dev so Postman testing still works
//         };
//       }
//       // In production, email failure = abort
//       throw emailErr;
//     }
//   }

//   // ── Step 2: Verify OTP & return token pair ────────────────────────────────
//   static async verifyOtp(email, otp) {
//     const result = await verifyOTP(email, otp);
//     if (!result.success)
//       throw new UnauthorizedError(result.reason ?? "Invalid OTP");

//     const user = await GarageUser.findOne({ email, isActive: true }).populate(
//       "garageId",
//     );
//     if (!user) throw new UnauthorizedError("User not found");

//     const payload = {
//       userId: user._id.toString(),
//       garageId: user.garageId._id.toString(),
//       role: user.role,
//       tokenVersion: user.tokenVersion,
//     };

//     const accessToken = signAccessToken(payload);
//     const refreshToken = await issueRefreshToken(user._id.toString());

//     logger.info({
//       type: "LOGIN_SUCCESS",
//       userId: user._id,
//       garageId: payload.garageId,
//       role: user.role,
//     });

//     return {
//       accessToken,
//       refreshToken,
//       user: { id: user._id, name: user.name, role: user.role },
//       garage: {
//         garageName: user.garageId.garageName,
//         subscriptionStatus: user.garageId.subscriptionStatus,
//       },
//     };
//   }

//   // ── Rotate refresh token ──────────────────────────────────────────────────
//   static async refreshTokens(rawRefreshToken) {
//     const { newRawToken, payload } = await rotateRefreshToken(rawRefreshToken);

//     const user = await GarageUser.findById(payload.userId);
//     if (!user || user.tokenVersion !== payload.tokenVersion) {
//       throw new UnauthorizedError("Session invalidated — please log in again");
//     }

//     const accessToken = signAccessToken({
//       userId: user._id.toString(),
//       garageId: user.garageId.toString(),
//       role: user.role,
//       tokenVersion: user.tokenVersion,
//     });

//     return { accessToken, refreshToken: newRawToken };
//   }

//   // ── Logout (single device) ────────────────────────────────────────────────
//   static async logout(rawRefreshToken) {
//     await revokeRefreshToken(rawRefreshToken);
//     return { success: true };
//   }

//   // ── Logout all devices ────────────────────────────────────────────────────
//   static async logoutAll(userId) {
//     await revokeAllRefreshTokens(userId);
//     return { success: true };
//   }
// }

// module.exports = { AuthService };

// src/services/auth.service.js
const { GarageUser } = require("../models");
const { sendAndStoreOTP, verifyOTP } = require("../lib/otp");
const {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
} = require("../lib/jwt");
const { AppError, UnauthorizedError } = require("../middleware/errorHandler");
const { env } = require("../config/env");
const { logger } = require("../lib/logger");

class AuthService {
  /**
   * Request OTP for a phone number.
   *
   * @param {string} phone - normalized 10-digit phone (without +91)
   * @param {string} ip - requester IP
   * @param {string} [name] - optional user name (for logging / dev)
   *
   * Returns object: { success: true, message, otp? } (otp present in dev mode)
   */
  static async requestOtp(phone, ip, name) {
    if (!phone) throw new AppError("phone required", 400);

    // sendAndStoreOTP internally handles rate-limits (identifier + IP),
    // storing otp in redis, hashing, and sending SMS in production.
    try {
      const resp = await sendAndStoreOTP({
        identifier: phone,
        userName: name,
        ip,
      });

      // resp expected like: { ok: true, message?, otp? } or { ok:false, reason }
      if (!resp || resp.ok === false) {
        // map known reasons to status codes or throw AppError
        const reason = resp?.reason || "otp_request_failed";
        // If ip/identifier rate-limited, throw 429
        if (reason && /rate/i.test(reason)) {
          throw new AppError("Too many requests", 429);
        }
        throw new AppError(`OTP request failed: ${reason}`, 400);
      }

      // success
      return {
        success: true,
        message: resp.message || "OTP requested",
        ...(resp.otp ? { otp: resp.otp } : {}),
      };
    } catch (err) {
      logger.error({
        type: "REQUEST_OTP_FAILED",
        phone,
        error: err.message || err,
      });
      // Throw user-friendly message
      throw new AppError(
        err.message || "Failed to request OTP",
        err.statusCode || 500,
      );
    }
  }

  /**
   * Verify OTP and return auth tokens for an existing user.
   *
   * NOTE: This method expects the user to exist (routes may create user/garage before calling this).
   *
   * @param {string} phone - normalized phone
   * @param {string} otp - provided OTP
   *
   * Returns { accessToken, refreshToken, user }
   */
  static async verifyOtp(phone, otp) {
    if (!phone || !otp) throw new AppError("phone and otp required", 400);

    // verifyOTP returns { ok: true } or { ok:false, reason }
    let verification;
    try {
      verification = await verifyOTP(phone, String(otp).trim());
    } catch (err) {
      logger.error({
        type: "VERIFY_OTP_ERROR",
        phone,
        error: err.message || err,
      });
      throw new UnauthorizedError("OTP verification failed");
    }

    if (!verification || verification.ok === false) {
      const reason = verification?.reason || "invalid";
      throw new UnauthorizedError(
        reason === "expired_or_missing" ? "OTP expired" : "Invalid OTP",
      );
    }

    // OTP ok — find user
    const user = await GarageUser.findOne({ phone, isActive: true })
      .populate("garageId")
      .exec();

    if (!user) {
      // Behavior choice:
      // - In production we should not auto-create user here (route handles creation)
      // - In development, return helpful message for testing
      if (env.NODE_ENV !== "production") {
        logger.info({ type: "VERIFY_OTP_NO_USER", phone });
        return {
          accessToken: null,
          refreshToken: null,
          user: null,
          message:
            "OTP verified but no user exists for this phone (dev). Create user first.",
        };
      }
      throw new UnauthorizedError("User not found");
    }

    // Build payload for JWT
    const payload = {
      userId: user._id.toString(),
      garageId:
        user.garageId && user.garageId._id
          ? user.garageId._id.toString()
          : user.garageId
            ? user.garageId.toString()
            : null,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };

    // Sign tokens
    const accessToken = signAccessToken(payload);
    const refreshToken = await issueRefreshToken(user._id.toString());

    logger.info({
      type: "LOGIN_SUCCESS",
      userId: user._id,
      garageId: payload.garageId,
      role: user.role,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
        phone: user.phone,
      },
    };
  }

  /**
   * Rotate refresh token -> returns new access + refresh token
   * @param {string} rawRefreshToken
   */
  static async refreshTokens(rawRefreshToken) {
    if (!rawRefreshToken) throw new AppError("refreshToken required", 400);

    const { newRawToken, payload } = await rotateRefreshToken(rawRefreshToken);

    const user = await GarageUser.findById(payload.userId).exec();
    if (!user || user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedError("Session invalidated — please log in again");
    }

    const accessToken = signAccessToken({
      userId: user._id.toString(),
      garageId: user.garageId ? user.garageId.toString() : null,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });

    return { accessToken, refreshToken: newRawToken };
  }

  /**
   * Logout single refresh token (revoke)
   * @param {string} rawRefreshToken
   */
  static async logout(rawRefreshToken) {
    if (!rawRefreshToken) throw new AppError("refreshToken required", 400);
    await revokeRefreshToken(rawRefreshToken);
    return { success: true };
  }

  /**
   * Logout all devices for user (revoke all refresh tokens)
   * @param {string} userId
   */
  static async logoutAll(userId) {
    if (!userId) throw new AppError("userId required", 400);
    await revokeAllRefreshTokens(userId);
    return { success: true };
  }
}

module.exports = { AuthService };
