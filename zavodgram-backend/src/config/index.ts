import dotenv from 'dotenv';
dotenv.config();

function requiredEnv(name: string, fallback?: string) {
  const value = process.env[name] || fallback || '';
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function ensureSafeSecret(name: string, value: string) {
  const lower = value.toLowerCase();
  const insecure = lower.includes('change-me') || lower === 'secret' || value.length < 32;
  if (insecure && process.env.NODE_ENV === 'production') {
    throw new Error(`Unsafe secret configured for ${name}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '4000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

  jwt: {
    secret: ensureSafeSecret('JWT_SECRET', requiredEnv('JWT_SECRET', 'change-me')),
    refreshSecret: ensureSafeSecret('JWT_REFRESH_SECRET', requiredEnv('JWT_REFRESH_SECRET', 'change-me-refresh')),
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  upload: {
    dir: process.env.UPLOAD_DIR || './uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800'), // 50MB
    allowedImageTypes: (process.env.ALLOWED_IMAGE_TYPES || 'image/jpeg,image/png,image/webp,image/gif').split(','),
  },


  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    botUsername: process.env.TELEGRAM_BOT_USERNAME || '',
    internalToken: process.env.TELEGRAM_INTERNAL_TOKEN || '',
    verificationTtlMinutes: parseInt(process.env.TELEGRAM_VERIFICATION_TTL_MINUTES || '15'),
    channelMirrorEnabled: (process.env.TELEGRAM_CHANNEL_MIRROR_ENABLED || 'false').toLowerCase() === 'true',
    channelMirrorSourceSlug: process.env.TELEGRAM_CHANNEL_MIRROR_SOURCE_SLUG || 'dvachannel',
    channelMirrorTargetSlug: process.env.TELEGRAM_CHANNEL_MIRROR_TARGET_SLUG || '',
    channelMirrorPollIntervalSec: parseInt(process.env.TELEGRAM_CHANNEL_MIRROR_POLL_INTERVAL_SEC || '120'),
    channelMirrorBatchSize: parseInt(process.env.TELEGRAM_CHANNEL_MIRROR_BATCH_SIZE || '10'),
  },

  encryption: {
    key: ensureSafeSecret('ENCRYPTION_KEY', requiredEnv('ENCRYPTION_KEY', 'change-me-32-bytes-key!!!!!!!!!!!')),
  },

  transcription: {
    provider: (process.env.TRANSCRIPTION_PROVIDER || 'none').toLowerCase(),
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
    openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    maxAudioBytes: parseInt(process.env.TRANSCRIPTION_MAX_AUDIO_BYTES || '26214400'),
    timeoutMs: parseInt(process.env.TRANSCRIPTION_TIMEOUT_MS || '30000'),
  },

  adminTags: (process.env.ADMIN_TAGS || '@admin')
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean),
} as const;
