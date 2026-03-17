// src/config/env.js
const { z } = require('zod');
require('dotenv').config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),

  // MongoDB
  MONGODB_URI: z.string().min(1),

  // Redis
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_EXPIRES: z.string().default('7d'),

  // OTP
  OTP_TTL_SECONDS: z.coerce.number().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
  OTP_LENGTH: z.coerce.number().default(6),

  // Email
  SENDGRID_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('GarBlaz <noreply@garblaz.com>'),

  // AWS S3
  AWS_REGION: z.string().default('ap-south-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().default('garblaz-uploads'),
  S3_PRESIGN_EXPIRES_SEC: z.coerce.number().default(900),

  // Observability
  SENTRY_DSN: z.string().optional().default(''),

  // App
  CLIENT_URL: z.string().default('http://localhost:3000'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌  Invalid environment variables:\n', parsed.error.format());
  process.exit(1);
}

module.exports = { env: parsed.data };
