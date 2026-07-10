import { Router } from 'express';
import { z } from 'zod';
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

booksRouter.get('/:id', asyncHandler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json({ book: await getBook(id) });
}));

booksRouter.post('/:id/send-to-kindle', asyncHandler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const book = await getBookFile(id);
  const result = await sendBookToKindle(book, req.user!);
  res.status(202).json({ status: 'queued', ...result });
}));
