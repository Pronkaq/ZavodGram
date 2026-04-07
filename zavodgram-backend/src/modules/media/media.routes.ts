import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { prisma } from '../../core/database';
import { authMiddleware, AuthPayload } from '../../middleware/auth';
import { config } from '../../config';
import { AuthError, ForbiddenError, NotFoundError, ValidationError } from '../../core/errors';
import { rateLimiter } from '../../middleware/errorHandler';
import { requireChatMembership, requireMessageInChat } from '../../core/security';

const router = Router();

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    const dir = path.join(config.upload.dir, 'temp');
    await fs.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuid()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxFileSize, files: 10 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'video/mp4', 'video/webm',
      'application/pdf', 'application/zip',
      'text/plain', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'audio/mpeg', 'audio/ogg', 'audio/wav',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new ValidationError('Неподдерживаемый тип файла') as any);
  },
});

function getMediaType(mime: string): 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO' {
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime.startsWith('video/')) return 'VIDEO';
  if (mime.startsWith('audio/')) return 'AUDIO';
  return 'DOCUMENT';
}


function resolveAuthPayload(req: Request): AuthPayload {
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const queryToken = typeof req.query.token === 'string' ? req.query.token : null;
  const token = bearer || queryToken;
  if (!token) throw new AuthError();
  try {
    return jwt.verify(token, config.jwt.secret) as AuthPayload;
  } catch {
    throw new AuthError();
  }
}

async function assertMediaReadableByUser(media: { uploaderId: string; messageId: string | null }, userId: string) {
  if (!media.messageId) {
    if (media.uploaderId !== userId) throw new ForbiddenError('Нет доступа к файлу');
    return;
  }

  const message = await prisma.message.findUnique({ where: { id: media.messageId } });
  if (!message || message.deleted) throw new NotFoundError('Сообщение');
  await requireChatMembership(prisma, message.chatId, userId);
}


async function persistFile(file: Express.Multer.File, userId: string) {
  const mediaType = getMediaType(file.mimetype);
  const dateDir = new Date().toISOString().slice(0, 10);
  const finalDir = path.join(config.upload.dir, mediaType.toLowerCase(), dateDir);
  await fs.mkdir(finalDir, { recursive: true });

  const finalPath = path.join(finalDir, file.filename);
  await fs.rename(file.path, finalPath);

  let thumbnail: string | null = null;
  let width: number | null = null;
  let height: number | null = null;

  if (mediaType === 'IMAGE') {
    const thumbDir = path.join(config.upload.dir, 'thumbnails', dateDir);
    await fs.mkdir(thumbDir, { recursive: true });

    const thumbFilename = `thumb_${file.filename}`;
    const thumbPath = path.join(thumbDir, thumbFilename);

    const metadata = await sharp(finalPath).metadata();
    width = metadata.width || null;
    height = metadata.height || null;

    await sharp(finalPath)
      .resize(200, 200, { fit: 'cover' })
      .jpeg({ quality: 70 })
      .toFile(thumbPath);

    thumbnail = `/internal/thumbnails/${dateDir}/${thumbFilename}`;
  }

  const url = `/internal/${mediaType.toLowerCase()}/${dateDir}/${file.filename}`;

  return prisma.mediaFile.create({
    data: {
      messageId: null,
      uploaderId: userId,
      type: mediaType,
      filename: file.filename,
      originalName: file.originalname.slice(0, 255),
      mimeType: file.mimetype,
      size: file.size,
      url,
      thumbnail,
      width,
      height,
    },
  });
}

router.post('/upload', authMiddleware, rateLimiter(20, 60), upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new ValidationError('Файл не прикреплён');

    if (req.body.messageId) {
      throw new ValidationError('Прямая привязка к messageId запрещена, используйте POST /api/media/:id/attach');
    }

    const media = await persistFile(req.file, req.user!.userId);
    res.status(201).json({ ok: true, data: media });
  } catch (err) { next(err); }
});

router.post('/upload-multiple', authMiddleware, rateLimiter(10, 60), upload.array('files', 10), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) throw new ValidationError('Файлы не прикреплены');
    if (req.body.messageId) {
      throw new ValidationError('Прямая привязка к messageId запрещена, используйте POST /api/media/:id/attach');
    }

    const results = [];
    for (const file of files) {
      const media = await persistFile(file, req.user!.userId);
      results.push(media);
    }

    res.status(201).json({ ok: true, data: results });
  } catch (err) { next(err); }
});

const attachSchema = z.object({ chatId: z.string().uuid(), messageId: z.string().uuid() });

router.post('/:id/attach', authMiddleware, rateLimiter(60, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId, messageId } = attachSchema.parse(req.body);
    const mediaId = req.params.id;
    const userId = req.user!.userId;

    await requireChatMembership(prisma, chatId, userId);
    const message = await requireMessageInChat(prisma, messageId, chatId);
    if (message.fromId !== userId) throw new ForbiddenError('Можно прикреплять только к своим сообщениям');

    const media = await prisma.mediaFile.findUnique({ where: { id: mediaId } });
    if (!media) throw new NotFoundError('Медиафайл');
    if (media.uploaderId !== userId) throw new ForbiddenError('Чужой медиафайл');
    if (media.messageId && media.messageId !== messageId) throw new ForbiddenError('Файл уже привязан к другому сообщению');

    const updated = await prisma.mediaFile.update({
      where: { id: mediaId },
      data: { messageId },
    });

    res.json({ ok: true, data: updated });
  } catch (err) { next(err); }
});

router.get('/:id/download', rateLimiter(120, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = resolveAuthPayload(req);
    const media = await prisma.mediaFile.findUnique({ where: { id: req.params.id } });
    if (!media) throw new NotFoundError('Медиафайл');

    await assertMediaReadableByUser(media, payload.userId);

    const relative = media.url.replace('/internal/', '');
    const filePath = path.resolve(config.upload.dir, relative);

    res.setHeader('Content-Type', media.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(media.originalName)}"`);
    createReadStream(filePath).pipe(res);
  } catch (err) { next(err); }
});


router.get('/legacy', rateLimiter(120, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = resolveAuthPayload(req);
    const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
    const normalized = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;

    const media = await prisma.mediaFile.findFirst({
      where: { OR: [{ url: normalized }, { thumbnail: normalized }] },
    });

    if (!media) throw new NotFoundError('Медиафайл');
    await assertMediaReadableByUser(media, payload.userId);

    const relative = media.url.replace('/internal/', '');
    const filePath = path.resolve(config.upload.dir, relative);

    res.setHeader('Content-Type', media.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(media.originalName)}"`);
    createReadStream(filePath).pipe(res);
  } catch (err) { next(err); }
});

export default router;
