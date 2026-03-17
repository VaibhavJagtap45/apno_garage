// // src/routes/auth.routes.js
// const express = require("express");
// const router = express.Router();

// const { sendAndStoreOTP, verifyOTP } = require("../lib/otp");
// const { GarageUser, Garage } = require("../models");
// const { signAccessToken, issueRefreshToken } = require("../lib/jwt");

// /**
//  * Normalize a phone number for Fast2SMS:
//  * - remove non-digits
//  * - drop leading 0 or +91 (if present)
//  * - finally require exactly 10 digits
//  */
// function normalizePhone(input) {
//   if (!input) return null;
//   let digits = String(input).replace(/\D/g, ""); // strip non-digits
//   // drop leading "0"
//   if (digits.length === 11 && digits.startsWith("0")) {
//     digits = digits.slice(1);
//   }
//   // drop leading "91" country code
//   if (digits.length === 12 && digits.startsWith("91")) {
//     digits = digits.slice(2);
//   }
//   // handle +91 (already removed non-digits above)
//   if (digits.length === 10) return digits;
//   return null;
// }

// function getRequestIP(req) {
//   return (
//     req.ip ||
//     req.headers["x-forwarded-for"] ||
//     (req.connection && req.connection.remoteAddress) ||
//     null
//   );
// }

// /**
//  * POST /api/auth/request-otp
//  * Body: { phone, name? }
//  */
// router.post("/request-otp", async (req, res, next) => {
//   try {
//     const { phone, name } = req.body;
//     const ip = getRequestIP(req);

//     if (!phone) return res.status(400).json({ error: "phone required" });

//     const normalized = normalizePhone(phone);
//     if (!normalized) {
//       return res
//         .status(422)
//         .json({
//           error: "invalid phone format (expect 10 digit indian number)",
//         });
//     }

//     // sendAndStoreOTP is expected to accept an object { identifier, userName, ip }
//     // and return { ok: true } or { ok: false, reason: '...' }
//     const result = await sendAndStoreOTP({
//       identifier: normalized,
//       userName: name,
//       ip,
//     });

//     if (!result || result.ok === false) {
//       // If OTP rate limited or other known situation, surface appropriate 429
//       const status = result && result.reason === "rate_limited" ? 429 : 400;
//       return res
//         .status(status)
//         .json({ ok: false, reason: result?.reason || "failed to request OTP" });
//     }

//     // success: in development the OTP lib may return otp for easier testing
//     return res.json({
//       ok: true,
//       message: "OTP sent (or generated)",
//       ...(result.otp ? { otp: result.otp } : {}),
//     });
//   } catch (err) {
//     next(err);
//   }
// });

// /**
//  * POST /api/auth/verify-otp
//  * Body: { phone, otp }
//  */
// router.post("/verify-otp", async (req, res, next) => {
//   try {
//     const { phone, otp } = req.body;

//     if (!phone || !otp) {
//       return res.status(400).json({ error: "phone and otp required" });
//     }

//     const normalized = normalizePhone(phone);
//     if (!normalized) {
//       return res
//         .status(422)
//         .json({
//           error: "invalid phone format (expect 10 digit indian number)",
//         });
//     }

//     // verifyOTP(identifier, otp) should return { ok: true } or { ok: false, reason: 'expired_or_missing'|'invalid'|... }
//     const result = await verifyOTP(normalized, String(otp).trim());

//     if (!result || result.ok === false) {
//       const code = result && result.reason === "expired_or_missing" ? 410 : 400;
//       return res
//         .status(code)
//         .json({ ok: false, reason: result?.reason || "invalid_otp" });
//     }

//     // Find garage related to this phone.
//     // NOTE: adjust the fields if your Garage model uses different keys for phone.
//     const garage = await Garage.findOne({
//       $or: [
//         { phone: normalized },
//         { contactNumber: normalized },
//         { ownerPhone: normalized },
//       ],
//     }).exec();

//     if (!garage) {
//       return res.status(404).json({
//         ok: false,
//         error:
//           "Garage not found for this phone. Ensure a Garage exists with matching phone/contactNumber/ownerPhone.",
//       });
//     }

//     // Find or create user by phone
//     let user = await GarageUser.findOne({ phone: normalized }).exec();

//     if (!user) {
//       const generatedName =
//         (req.body.name && String(req.body.name).trim()) ||
//         `user_${normalized.slice(-4)}`;
//       user = await GarageUser.create({
//         name: generatedName,
//         phone: normalized,
//         role: "GARAGE_OWNER",
//         garageId: garage._id,
//         isVerified: true,
//       });
//     }

//     // Build payload for JWT
//     const payload = {
//       userId: user._id.toString(),
//       garageId: user.garageId
//         ? user.garageId.toString()
//         : garage._id.toString(),
//       role: user.role,
//       tokenVersion: user.tokenVersion,
//     };

//     const accessToken = signAccessToken(payload);
//     const refreshToken = await issueRefreshToken(user._id);

//     // sanitize user to return minimal fields
//     const safeUser = {
//       id: user._id,
//       name: user.name,
//       phone: user.phone,
//       role: user.role,
//       garageId: user.garageId || garage._id,
//     };

//     return res.json({
//       ok: true,
//       message: "Phone verified",
//       accessToken,
//       refreshToken,
//       user: safeUser,
//     });
//   } catch (err) {
//     next(err);
//   }
// });

// module.exports = router;

// src/routes/auth.routes.js
const express = require("express");
const router = express.Router();

const { sendAndStoreOTP, verifyOTP } = require("../lib/otp");
const { GarageUser, Garage } = require("../models");
const { signAccessToken, issueRefreshToken } = require("../lib/jwt");

/**
 * Normalize a phone number for Fast2SMS:
 * - remove non-digits
 * - drop leading 0 or +91 (if present)
 * - finally require exactly 10 digits
 */
function normalizePhone(input) {
  if (!input) return null;
  let digits = String(input).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length >= 12 && digits.startsWith("91"))
    digits = digits.slice(digits.length - 10);
  if (digits.length === 10) return digits;
  return null;
}

function getRequestIP(req) {
  return (
    req.ip ||
    req.headers["x-forwarded-for"] ||
    (req.connection && req.connection.remoteAddress) ||
    null
  );
}

/**
 * POST /api/auth/request-otp
 * Body: { phone, name? }
 */
router.post("/request-otp", async (req, res, next) => {
  try {
    const { phone, name } = req.body;
    const ip = getRequestIP(req);

    if (!phone) return res.status(400).json({ error: "phone required" });

    const normalized = normalizePhone(phone);
    if (!normalized) {
      return res.status(422).json({
        error: "invalid phone format (expect 10 digit indian number)",
      });
    }

    const result = await sendAndStoreOTP({
      identifier: normalized,
      userName: name,
      ip,
    });

    if (!result || result.ok === false) {
      const status =
        result && result.reason && result.reason.includes("rate") ? 429 : 400;
      return res
        .status(status)
        .json({ ok: false, reason: result?.reason || "failed to request OTP" });
    }

    return res.json({
      ok: true,
      message: "OTP sent (or generated)",
      ...(result.otp ? { otp: result.otp } : {}),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/verify-otp
 * Body: { phone, otp, name?, garageName?, address?, contactNumber? }
 *
 * If Garage not found for phone, create one (auto-register).
 */
router.post("/verify-otp", async (req, res, next) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ error: "phone and otp required" });
    }

    const normalized = normalizePhone(phone);
    if (!normalized) {
      return res.status(422).json({
        error: "invalid phone format (expect 10 digit indian number)",
      });
    }

    // verify OTP (identifier-based)
    const result = await verifyOTP(normalized, String(otp).trim());

    if (!result || result.ok === false) {
      const code = result && result.reason === "expired_or_missing" ? 410 : 400;
      return res
        .status(code)
        .json({ ok: false, reason: result?.reason || "invalid_otp" });
    }

    // Try to find an existing garage by common phone fields
    let garage = await Garage.findOne({
      $or: [
        { phone: normalized },
        { contactNumber: normalized },
        { ownerPhone: normalized },
      ],
    }).exec();

    // If garage not found => create a new Garage (auto-register)
    if (!garage) {
      // Accept optional creation fields from request body or use sensible defaults
      const {
        name: ownerName,
        garageName,
        address,
        contactNumber,
        extra = {},
      } = req.body;

      // In the "if (!garage)" block inside POST /verify-otp
      const newGarageData = {
        garageName: garageName
          ? String(garageName).trim()
          : `Garage_${normalized.slice(-4)}`,
        phone: normalized,
        contactNo: normalized, // ← satisfies the unique index
        contactNumber: contactNumber
          ? String(contactNumber).replace(/\D/g, "")
          : normalized,
        ownerName: ownerName
          ? String(ownerName).trim()
          : `owner_${normalized.slice(-4)}`,
        garageType: req.body.garageType || "BOTH", // ← was missing, caused validation crash
        email: req.body.email || "", // ← was missing, caused validation crash
        address: address ? String(address).trim() : "",
        createdAt: new Date(),
        ...extra,
      };

      // Create and save the new garage
      garage = await Garage.create(newGarageData);
    }

    // Find or create the GarageUser
    let user = await GarageUser.findOne({ phone: normalized }).exec();

    if (!user) {
      const providedName =
        (req.body.name && String(req.body.name).trim()) ||
        `user_${normalized.slice(-4)}`;
      user = await GarageUser.create({
        name: providedName,
        phone: normalized,
        role: "GARAGE_OWNER",
        garageId: garage._id,
        isVerified: true,
        createdAt: new Date(),
      });
    } else {
      // ensure user is linked to the garage (if not already)
      if (
        !user.garageId ||
        user.garageId.toString() !== garage._id.toString()
      ) {
        user.garageId = garage._id;
        user.isVerified = true;
        await user.save();
      }
    }

    // Build JWT payload
    const payload = {
      userId: user._id.toString(),
      garageId: user.garageId
        ? user.garageId.toString()
        : garage._id.toString(),
      role: user.role,
      tokenVersion: user.tokenVersion,
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = await issueRefreshToken(user._id);

    const safeUser = {
      id: user._id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      garageId: user.garageId || garage._id,
    };

    return res.json({
      ok: true,
      message: "Phone verified and account ready",
      accessToken,
      refreshToken,
      user: safeUser,
      garage: { id: garage._id, garageName: garage.garageName || null },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
