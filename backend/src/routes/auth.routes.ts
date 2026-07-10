import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import { login, updateProfile } from '../services/auth.service.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});
const updateProfileSchema = z.object({
  name: z.string().max(120).nullable().optional(),
  kindleEmail: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(8).optional()
});

export const authRouter = Router();

authRouter.post('/login', asyncHandler(async (req, res) => {
  const credentials = loginSchema.parse(req.body);
  res.json(await login(credentials.email, credentials.password));
}));

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ user: req.user });
}));

authRouter.patch('/me', requireAuth, asyncHandler(async (req, res) => {
  const input = updateProfileSchema.parse(req.body);
  res.json({ user: await updateProfile(req.user!.id, input) });
}));
