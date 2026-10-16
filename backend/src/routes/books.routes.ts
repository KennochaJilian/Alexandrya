import { getReadingProgress, saveReadingProgress } from '../services/reading-progress.service.js';
import { recordActivity } from '../services/activity.service.js';
import { logger, serializeError } from '../utils/logger.js';
import { Router } from 'express';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { HttpError } from '../errors.js';
import { getBook, getBookFile, searchBooks } from '../services/library.service.js';
import { sendBookToKindle } from '../services/kindle.service.js';
import { asyncHandler } from '../utils/async-handler.js';

const searchSchema = z.object({
  q: z.string().optional(),
  title: z.string().optional(),
  author: z.string().optional(),
  genre: z.string().optional(),
  publishedFrom: z.string().optional(),
  publishedTo: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional()
});
const idSchema = z.string().min(1);

export const booksRouter = Router();

booksRouter.get('/', asyncHandler(async (req, res) => {
  const filters = searchSchema.parse(req.query);
  res.json(await searchBooks(filters));
}));

booksRouter.get('/:id/download', asyncHandler(async (req, res, next) => {
  const id = idSchema.parse(req.params.id);
  const book = await getBookFile(id);

  try {
    await fs.access(book.filePath);
  } catch {
    throw new HttpError(404, 'BOOK_FILE_NOT_FOUND', 'Fichier du livre introuvable.');
  }

  res.download(book.filePath, book.fileName, (error) => {
    if (error) { next(error); return; }
    void recordActivity(book, req.user!, 'download').catch((error: unknown) => {
      logger.error('download activity recording failed', { error: serializeError(error) });
    });
  });
}));

// Reading is authenticated by the books router mount, and is not a download event.
booksRouter.get('/:id/read', asyncHandler(async (req, res, next) => {
  const book = await getBookFile(idSchema.parse(req.params.id));
  const format = book.format.toLowerCase();
  if (format !== 'epub' && format !== 'pdf') {
    throw new HttpError(415, 'READ_FORMAT_UNSUPPORTED', 'La lecture en ligne est disponible pour les livres EPUB et PDF.');
  }
  try {
    await fs.access(book.filePath);
  } catch {
    throw new HttpError(404, 'BOOK_FILE_NOT_FOUND', 'Fichier du livre introuvable.');
  }
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type(format === 'pdf' ? 'application/pdf' : 'application/epub+zip');
  res.sendFile(book.filePath, (error) => { if (error) next(error); });
}));

booksRouter.get('/:id', asyncHandler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json({ book: await getBook(id) });
}));

booksRouter.post('/:id/send-to-kindle', asyncHandler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const book = await getBookFile(id);
  const result = await sendBookToKindle(book, req.user!);
  await recordActivity(book, req.user!, 'kindle').catch((error: unknown) => {
    logger.error('kindle activity recording failed', { error: serializeError(error) });
  });
  res.status(202).json({ status: 'queued', ...result });
}));

booksRouter.get('/:id/progress', asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ progress: await getReadingProgress(req.user!.id, idSchema.parse(req.params.id)) });
}));

booksRouter.put('/:id/progress', asyncHandler(async (req, res) => {
  await saveReadingProgress(req.user!.id, idSchema.parse(req.params.id), req.body);
  res.status(204).end();
}));
