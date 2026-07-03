import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../errors.js';
import { verifyToken } from '../services/auth.service.js';

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const authorization = req.header('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    next(new HttpError(401, 'AUTH_REQUIRED', 'Authentification requise.'));
    return;
  }

  try {
    req.user = await verifyToken(authorization.slice('Bearer '.length));
    next();
  } catch (error) {
    next(error);
  }
}
