import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

  jwt: {
    secret: process.env.JWT_SECRET || 'change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh',
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

  encryption: {
    key: process.env.ENCRYPTION_KEY || 'change-me-32-bytes-key!!!!!!!!!!!',
  },
} as const;
