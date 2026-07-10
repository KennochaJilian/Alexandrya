import { Router } from 'express';
import { z } from 'zod';
import { createUser, listUsers } from '../services/auth.service.js';
import { refreshLibrary, syncSearchIndex } from '../services/library.service.js';
import { asyncHandler } from '../utils/async-handler.js';

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().max(120).optional(),
  kindleEmail: z.union([z.string().email(), z.literal('')]).optional(),
  role: z.enum(['user', 'admin']).optional()
});

export const adminRouter = Router();

adminRouter.get('/users', asyncHandler(async (_req, res) => {
  const users = await listUsers();
  res.json({ users, total: users.length });
}));

adminRouter.post('/users', asyncHandler(async (req, res) => {
  const input = createUserSchema.parse(req.body);
  const user = await createUser(input);
  res.status(201).json({ user });
}));

adminRouter.post('/library/rescan', asyncHandler(async (_req, res) => {
  const books = await refreshLibrary();
  res.json({ total: books.length });
}));

adminRouter.post('/search/reindex', asyncHandler(async (_req, res) => {
  res.json(await syncSearchIndex());
}));
