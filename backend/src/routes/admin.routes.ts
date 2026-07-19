import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import multer, { MulterError } from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { createUser, listUsers } from '../services/auth.service.js';
import {
  deleteBook,
  importUploadedBookFiles,
  isSupportedEbookFileName,
  refreshLibrary,
  syncSearchIndex,
  type UploadedBookFile
} from '../services/library.service.js';
import { getMaintenanceJob, startMaintenanceJob } from '../services/maintenance-job.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { logger, serializeError } from '../utils/logger.js';

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().max(120).optional(),
  kindleEmail: z.union([z.string().email(), z.literal('')]).optional(),
  role: z.enum(['user', 'admin']).optional()
});
const idSchema = z.string().min(1);

export const adminRouter = Router();

const uploadStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    void fs.mkdir(config.uploadTempPath, { recursive: true })
      .then(() => callback(null, config.uploadTempPath))
      .catch((error: unknown) => callback(error as Error, config.uploadTempPath));
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${crypto.randomUUID()}${extension}`);
  }
});

const uploadMiddleware = multer({
  storage: uploadStorage,
  limits: {
    files: config.uploadMaxFiles,
    fileSize: config.uploadMaxFileSizeBytes
  },
  fileFilter: (_req, file, callback) => {
    if (!isSupportedEbookFileName(file.originalname)) {
      callback(new HttpError(400, 'UNSUPPORTED_UPLOAD_FORMAT', `Format non supporte: ${file.originalname}`));
      return;
    }

    callback(null, true);
  }
}).array('files', config.uploadMaxFiles);

async function cleanupUploadedFiles(files: Express.Multer.File[] | undefined) {
  await Promise.all((files ?? []).map(async (file) => {
    try {
      await fs.unlink(file.path);
    } catch (error) {
      logger.warn('upload temp cleanup failed', {
        path: file.path,
        error: serializeError(error)
      });
    }
  }));
}

function readMulterFiles(files: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] } | undefined) {
  if (!files) {
    return [];
  }

  return Array.isArray(files) ? files : Object.values(files).flat();
}

function uploadBooks(req: Parameters<typeof uploadMiddleware>[0], res: Parameters<typeof uploadMiddleware>[1], next: Parameters<typeof uploadMiddleware>[2]) {
  uploadMiddleware(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }

    const files = readMulterFiles(req.files);
    void cleanupUploadedFiles(files).finally(() => {
      if (error instanceof MulterError) {
        const message = error.code === 'LIMIT_FILE_SIZE'
          ? `Chaque fichier doit faire au maximum ${Math.round(config.uploadMaxFileSizeBytes / 1024 / 1024)} Mo.`
          : error.code === 'LIMIT_FILE_COUNT'
          ? `${config.uploadMaxFiles} fichiers maximum par upload.`
          : 'Upload invalide.';
        next(new HttpError(400, error.code, message));
        return;
      }

      next(error);
    });
  });
}

adminRouter.get('/users', asyncHandler(async (_req, res) => {
  const users = await listUsers();
  res.json({ users, total: users.length });
}));

adminRouter.post('/users', asyncHandler(async (req, res) => {
  const input = createUserSchema.parse(req.body);
  const user = await createUser(input);
  res.status(201).json({ user });
}));

adminRouter.post('/library/upload', uploadBooks, asyncHandler(async (req, res) => {
  const files = readMulterFiles(req.files);

  if (!files.length) {
    throw new HttpError(400, 'NO_UPLOAD_FILES', 'Aucun fichier a importer.');
  }

  const uploadedFiles: UploadedBookFile[] = files.map((file) => ({
    tempPath: file.path,
    originalName: file.originalname,
    sizeBytes: file.size
  }));

  try {
    const books = await importUploadedBookFiles(uploadedFiles);
    res.status(201).json({ books, total: books.length });
  } catch (error) {
    await cleanupUploadedFiles(files);
    throw error;
  }
}));

adminRouter.delete('/books/:id', asyncHandler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json(await deleteBook(id));
}));

adminRouter.post('/library/rescan', asyncHandler(async (_req, res) => {
  const job = startMaintenanceJob('library-rescan', async () => {
    const books = await refreshLibrary();
    return { total: books.length };
  });

  res.status(202).json({ job });
}));

adminRouter.post('/search/reindex', asyncHandler(async (_req, res) => {
  const job = startMaintenanceJob('search-reindex', syncSearchIndex);

  res.status(202).json({ job });
}));

adminRouter.get('/jobs/:id', asyncHandler(async (req, res) => {
  const id = req.params.id;

  if (typeof id !== 'string' || !id) {
    res.status(400).json({
      code: 'JOB_ID_REQUIRED',
      message: 'Identifiant de tache requis.'
    });
    return;
  }

  const job = getMaintenanceJob(id);

  if (!job) {
    res.status(404).json({
      code: 'JOB_NOT_FOUND',
      message: 'Tache introuvable.'
    });
    return;
  }

  res.json({ job });
}));
