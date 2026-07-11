import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../errors.js';
import { logger, serializeError } from '../utils/logger.js';

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, 'NOT_FOUND', 'Route introuvable.'));
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  logger.error('http request failed', {
    method: req.method,
    path: req.originalUrl,
    error: serializeError(error)
  });

  if (error instanceof ZodError) {
    res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Parametres invalides.',
      details: error.flatten()
    });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.status).json({
      code: error.code,
      message: error.message,
      details: error.details
    });
    return;
  }

  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'Erreur serveur.'
  });
}
