import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import type { AppUser, PublicUser } from '../models/user.js';

const TOKEN_TTL = '12h';

interface TokenPayload {
  sub: string;
  email: string;
}

export function toPublicUser(user: AppUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    kindleEmail: user.kindleEmail
  };
}

export function findUserById(id: string): AppUser | undefined {
  return config.users.find((user) => user.id === id);
}

export async function login(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = config.users.find((candidate) => candidate.email.toLowerCase() === normalizedEmail);

  if (!user) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email ou mot de passe incorrect.');
  }

  const passwordMatches = user.passwordHash
    ? await bcrypt.compare(password, user.passwordHash)
    : user.password === password;

  if (!passwordMatches) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email ou mot de passe incorrect.');
  }

  const token = jwt.sign(
    { email: user.email } satisfies Omit<TokenPayload, 'sub'>,
    config.jwtSecret,
    {
      subject: user.id,
      expiresIn: TOKEN_TTL
    }
  );

  return {
    token,
    user: toPublicUser(user)
  };
}

export function verifyToken(token: string): PublicUser {
  const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload & { sub: string };
  const user = findUserById(decoded.sub);

  if (!user) {
    throw new HttpError(401, 'USER_NOT_FOUND', 'Utilisateur introuvable.');
  }

  return toPublicUser(user);
}
