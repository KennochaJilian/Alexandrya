import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { requireAuth } from './middleware/auth.middleware.js';
import { errorHandler, notFound } from './middleware/error.middleware.js';
import { authRouter } from './routes/auth.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { booksRouter } from './routes/books.routes.js';
import { requireAdmin } from './middleware/auth.middleware.js';

export function createApp() {
  const app = express();

  app.use(cors({
    origin: config.corsOrigin,
    credentials: false
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(config.coverPublicPath, express.static(config.coverStoragePath, {
    immutable: true,
    maxAge: '30d'
  }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/books', requireAuth, booksRouter);
  app.use('/api/admin', requireAuth, requireAdmin, adminRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
