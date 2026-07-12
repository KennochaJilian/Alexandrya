import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { UserModel, type UserRecord, type UserRole } from '../db/models/user.model.js';
import { HttpError } from '../errors.js';
import type { PublicUser } from '../models/user.js';

const TOKEN_TTL = '12h';

interface TokenPayload {
  sub: string;
  email: string;
}

type UserLike = UserRecord & { _id: unknown };

interface UpdateProfileInput {
  name?: string | null;
  kindleEmail?: string | null;
  currentPassword?: string;
  newPassword?: string;
}

interface CreateUserInput {
  email: string;
  password: string;
  name?: string;
  kindleEmail?: string;
  role?: UserRole;
}

export function toPublicUser(user: UserLike): PublicUser {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    kindleEmail: user.kindleEmail,
    role: user.role ?? 'user'
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
  let decoded: TokenPayload & { sub: string };

  try {
    decoded = jwt.verify(token, config.jwtSecret) as TokenPayload & { sub: string };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new HttpError(401, 'TOKEN_EXPIRED', 'Session expiree.');
    }

    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.NotBeforeError) {
      throw new HttpError(401, 'TOKEN_INVALID', 'Session invalide.');
    }

    throw error;
  }

  const user = await findUserById(decoded.sub);

  if (!user) {
    throw new HttpError(401, 'USER_NOT_FOUND', 'Utilisateur introuvable.');
  }

  return user;
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<PublicUser> {
  const user = await UserModel.findById(userId).select('+passwordHash');

  if (!user) {
    throw new HttpError(404, 'USER_NOT_FOUND', 'Utilisateur introuvable.');
  }

  if (input.name !== undefined) {
    user.name = input.name?.trim() || undefined;
  }

  if (input.kindleEmail !== undefined) {
    user.kindleEmail = input.kindleEmail?.trim().toLowerCase() || undefined;
  }

  if (input.newPassword) {
    if (!input.currentPassword) {
      throw new HttpError(400, 'CURRENT_PASSWORD_REQUIRED', 'Mot de passe actuel requis.');
    }

    const passwordMatches = await bcrypt.compare(input.currentPassword, user.passwordHash);

    if (!passwordMatches) {
      throw new HttpError(400, 'INVALID_CURRENT_PASSWORD', 'Mot de passe actuel incorrect.');
    }

    user.passwordHash = await bcrypt.hash(input.newPassword, 12);
  }

  await user.save();
  return toPublicUser(user);
}

export async function listUsers(): Promise<PublicUser[]> {
  const users = await UserModel.find().sort({ email: 1 }).lean();
  return users.map(toPublicUser);
}

export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const existingUser = await UserModel.findOne({ email: normalizedEmail }).lean();

  if (existingUser) {
    throw new HttpError(409, 'USER_ALREADY_EXISTS', 'Un utilisateur existe deja avec cet email.');
  }

  const user = await UserModel.create({
    email: normalizedEmail,
    passwordHash: await bcrypt.hash(input.password, 12),
    name: input.name?.trim() || undefined,
    kindleEmail: input.kindleEmail?.trim().toLowerCase() || undefined,
    role: input.role ?? 'user'
  });

  return toPublicUser(user);
}
