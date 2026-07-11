import { Router } from 'express';
import { z } from 'zod';
import { createUser, listUsers } from '../services/auth.service.js';
import { refreshLibrary, syncSearchIndex } from '../services/library.service.js';
import { getMaintenanceJob, startMaintenanceJob } from '../services/maintenance-job.service.js';
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
