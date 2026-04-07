import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuid } from 'uuid';
import { prisma } from '../../core/database';
import { authMiddleware } from '../../middleware/auth';
import { config } from '../../config';
import { ValidationError } from '../../core/errors';

const router = Router();

// ── Multer setup ──
const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    const dir = path.join(config.upload.dir, 'temp');
    await fs.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxFileSize },
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

// ── POST /media/upload ──
router.post('/upload', authMiddleware, upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new ValidationError('Файл не прикреплён');

    const file = req.file;
    const mediaType = getMediaType(file.mimetype);
    const userId = req.user!.userId;
    const messageId = req.body.messageId || null;

    // Организуем хранение по датам
    const dateDir = new Date().toISOString().slice(0, 10);
    const finalDir = path.join(config.upload.dir, mediaType.toLowerCase(), dateDir);
    await fs.mkdir(finalDir, { recursive: true });

    const finalPath = path.join(finalDir, file.filename);
    await fs.rename(file.path, finalPath);

    // Генерируем thumbnail для изображений
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

      thumbnail = `/uploads/thumbnails/${dateDir}/${thumbFilename}`;
    }

    const url = `/uploads/${mediaType.toLowerCase()}/${dateDir}/${file.filename}`;

    const media = await prisma.mediaFile.create({
      data: {
        messageId,
        uploaderId: userId,
        type: mediaType,
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url,
        thumbnail,
        width,
        height,
      },
    });

    res.status(201).json({ ok: true, data: media });
  } catch (err) { next(err); }
});

// ── POST /media/upload-multiple ──
router.post('/upload-multiple', authMiddleware, upload.array('files', 10), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) throw new ValidationError('Файлы не прикреплены');

    const userId = req.user!.userId;
    const messageId = req.body.messageId || null;
    const results = [];

    for (const file of files) {
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
        await sharp(finalPath).resize(200, 200, { fit: 'cover' }).jpeg({ quality: 70 }).toFile(thumbPath);
        thumbnail = `/uploads/thumbnails/${dateDir}/${thumbFilename}`;
      }

      const url = `/uploads/${mediaType.toLowerCase()}/${dateDir}/${file.filename}`;

      const media = await prisma.mediaFile.create({
        data: { messageId, uploaderId: userId, type: mediaType, filename: file.filename, originalName: file.originalname, mimeType: file.mimetype, size: file.size, url, thumbnail, width, height },
      });

      results.push(media);
    }

    res.status(201).json({ ok: true, data: results });
  } catch (err) { next(err); }
});

export default router;
