import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { UserModel, type UserRecord } from '../db/models/user.model.js';
import { HttpError } from '../errors.js';
import type { PublicUser } from '../models/user.js';

const TOKEN_TTL = '12h';

interface TokenPayload {
  sub: string;
  email: string;
}

type UserLike = UserRecord & { _id: unknown };

export function toPublicUser(user: UserLike): PublicUser {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    kindleEmail: user.kindleEmail
  };
}

export async function findUserById(id: string): Promise<PublicUser | null> {
  const user = await UserModel.findById(id).lean();
  return user ? toPublicUser(user) : null;
}

export async function login(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await UserModel.findOne({ email: normalizedEmail }).select('+passwordHash').lean();

  if (!user) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email ou mot de passe incorrect.');
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email ou mot de passe incorrect.');
  }

  const token = jwt.sign(
    { email: user.email } satisfies Omit<TokenPayload, 'sub'>,
    config.jwtSecret,
    {
      subject: String(user._id),
      expiresIn: TOKEN_TTL
    }
  );

  return {
    token,
    user: toPublicUser(user)
  };
}

export async function verifyToken(token: string): Promise<PublicUser> {
  const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload & { sub: string };
  const user = await findUserById(decoded.sub);

  if (!user) {
    throw new HttpError(401, 'USER_NOT_FOUND', 'Utilisateur introuvable.');
  }

  return user;
}
