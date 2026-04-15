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
      'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4',
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


function resolveAuthPayload(req: Request, options?: { allowQueryToken?: boolean }): AuthPayload {
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const queryToken = options?.allowQueryToken && typeof req.query.token === 'string' ? req.query.token : null;
  const token = bearer || queryToken;
  if (!token) throw new AuthError();
  try {
    return jwt.verify(token, config.jwt.secret) as AuthPayload;
  } catch {
    throw new AuthError();
  }
}

async function assertMediaReadableByUser(
  media: { id: string; uploaderId: string; messageId: string | null; protectedBySafeMode: boolean },
  userId: string
) {
  //  :
  // -    
  // -        - avatar (media:<id>)
  if (!media.messageId) {
    if (media.uploaderId === userId) return;

    const avatarRef = `media:${media.id}`;
    const avatarOwner = await prisma.user.findFirst({
      where: { avatar: avatarRef },
      select: { id: true },
    });
    if (avatarOwner) return;

    const avatarChat = await prisma.chat.findFirst({
      where: { avatar: avatarRef },
      select: {
        id: true,
        type: true,
        channelSlug: true,
        members: {
          where: { userId },
          select: { userId: true },
          take: 1,
        },
      },
    });

    if (!avatarChat) throw new ForbiddenError('Нет доступа к файлу');

    // For GROUP chats avatar is available only to members.
    // For public CHANNEL avatar can be read by any authenticated user.
    const isMember = avatarChat.members.length > 0;
    const isPublicChannel = avatarChat.type === 'CHANNEL' && !!avatarChat.channelSlug;
    if (!isMember && !isPublicChannel) throw new ForbiddenError('Нет доступа к файлу');
    return;
  }

  //        membership 
  const message = await prisma.message.findUnique({
    where: { id: media.messageId },
    include: { chat: { select: { type: true, contentProtectionEnabled: true } } },
  });
  if (!message || message.deleted) throw new NotFoundError('');

  await requireChatMembership(prisma, message.chatId, userId);

  const activeProtectionLock = message.chat?.contentProtectionEnabled
    && (message.chat.type === 'PRIVATE' || message.chat.type === 'SECRET');
  if (media.protectedBySafeMode && !activeProtectionLock) {
    throw new ForbiddenError('Медиа в этом чате недоступно');
  }
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

async function transcribeWithOpenAI(filePath: string, originalName: string, mimeType: string) {
  if (!config.transcription.openaiApiKey) {
    throw new ValidationError('Сервис расшифровки не настроен');
  }

  const audioBuffer = await fs.readFile(filePath);
  if (audioBuffer.length > config.transcription.maxAudioBytes) {
    throw new ValidationError('Аудио слишком большое для расшифровки');
  }

  const form = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType || 'application/octet-stream' });
  form.append('file', blob, originalName || path.basename(filePath));
  form.append('model', config.transcription.openaiModel);

  const endpoint = `${config.transcription.openaiBaseUrl.replace(/\/+$/, '')}/audio/transcriptions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.transcription.openaiApiKey}`,
    },
    body: form,
    signal: AbortSignal.timeout(config.transcription.timeoutMs),
  });

  if (!response.ok) {
    throw new ValidationError('Не удалось получить расшифровку');
  }

  const payload = await response.json() as { text?: string };
  const text = payload?.text?.trim();
  if (!text) {
    throw new ValidationError('Расшифровка пуста');
  }

  return text;
}

async function streamMediaFile(req: Request, res: Response, filePath: string, mimeType: string, originalName: string) {
  const fileStat = await fs.stat(filePath);
  const fileSize = fileStat.size;
  const rangeHeader = req.headers.range;

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=60');

  if (!rangeHeader) {
    res.setHeader('Content-Length', fileSize);
    createReadStream(filePath).pipe(res);
    return;
  }

  const bytesPrefix = 'bytes=';
  if (!rangeHeader.startsWith(bytesPrefix)) {
    res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
    return;
  }

  const [startRaw, endRaw] = rangeHeader.slice(bytesPrefix.length).split('-');

  let start: number;
  let end: number;
  if (!startRaw && endRaw) {
    const suffixLength = Number.parseInt(endRaw, 10);
    if (Number.isNaN(suffixLength) || suffixLength <= 0) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
      return;
    }
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else {
    start = Number.parseInt(startRaw, 10);
    end = endRaw ? Number.parseInt(endRaw, 10) : fileSize - 1;
  }

  if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < start || end >= fileSize) {
    res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
    return;
  }

  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
  res.setHeader('Content-Length', end - start + 1);
  createReadStream(filePath, { start, end }).pipe(res);
}

function normalizeUploadRelativePath(rawPath: string) {
  if (!rawPath.startsWith('/internal/')) {
    throw new ValidationError('Некорректный путь к медиафайлу');
  }
  return rawPath.replace('/internal/', '');
}

function resolveUploadPathFromRelative(relativePath: string) {
  const uploadRoot = path.resolve(config.upload.dir);
  const absolute = path.resolve(uploadRoot, relativePath);
  if (!absolute.startsWith(uploadRoot + path.sep) && absolute !== uploadRoot) {
    throw new ForbiddenError('Некорректный путь к файлу');
  }
  return absolute;
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
    const payload = resolveAuthPayload(req, { allowQueryToken: true });
    const media = await prisma.mediaFile.findUnique({ where: { id: req.params.id } });
    if (!media) throw new NotFoundError('Медиафайл');

    await assertMediaReadableByUser(media, payload.userId);

    const relative = normalizeUploadRelativePath(media.url);
    const filePath = resolveUploadPathFromRelative(relative);

    await streamMediaFile(req, res, filePath, media.mimeType, media.originalName);
  } catch (err) { next(err); }
});

router.post('/:id/transcribe', authMiddleware, rateLimiter(20, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const media = await prisma.mediaFile.findUnique({ where: { id: req.params.id } });
    if (!media) throw new NotFoundError('Медиафайл');
    if (media.type !== 'AUDIO') throw new ValidationError('Расшифровка доступна только для голосовых сообщений');
    if (!media.messageId) throw new ForbiddenError('Файл ещё не привязан к сообщению');

    await assertMediaReadableByUser(media, req.user!.userId);

    if (config.transcription.provider !== 'openai') {
      throw new ValidationError('Расшифровка недоступна: не настроен провайдер');
    }

    const relative = normalizeUploadRelativePath(media.url);
    const filePath = resolveUploadPathFromRelative(relative);
    const text = await transcribeWithOpenAI(filePath, media.originalName, media.mimeType);

    res.json({ ok: true, data: { mediaId: media.id, text } });
  } catch (err) { next(err); }
});


router.get('/legacy', rateLimiter(120, 60), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = resolveAuthPayload(req, { allowQueryToken: true });
    const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
    const normalized = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;

    const media = await prisma.mediaFile.findFirst({
      where: { OR: [{ url: normalized }, { thumbnail: normalized }] },
    });

    if (!media) throw new NotFoundError('Медиафайл');
    await assertMediaReadableByUser(media, payload.userId);

    const requestedPath = normalized === media.thumbnail ? media.thumbnail ?? media.url : media.url;
    const relative = normalizeUploadRelativePath(requestedPath);
    const filePath = resolveUploadPathFromRelative(relative);

    await streamMediaFile(req, res, filePath, media.mimeType, media.originalName);
  } catch (err) { next(err); }
});

export default router;
