import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { requireAuth } from './middleware/auth.middleware.js';
import { errorHandler, notFound } from './middleware/error.middleware.js';
import { authRouter } from './routes/auth.routes.js';
import { booksRouter } from './routes/books.routes.js';

export function createApp() {
  const app = express();

  app.use(cors({
    origin: config.corsOrigin,
    credentials: false
  }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/books', requireAuth, booksRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
