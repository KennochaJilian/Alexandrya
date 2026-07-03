import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { AppUser } from './models/user.js';

const userSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional(),
  password: z.string().min(1).optional(),
  passwordHash: z.string().min(1).optional(),
  kindleEmail: z.string().email().optional()
}).refine((user) => user.password || user.passwordHash, {
  message: 'Chaque utilisateur doit avoir password ou passwordHash'
});

const usersSchema = z.array(userSchema).min(1);

function resolveFromBackend(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

function loadUsers(usersFile: string): AppUser[] {
  if (!fs.existsSync(usersFile)) {
    return [
      {
        id: 'local-admin',
        name: 'Admin',
        email: 'admin@local.test',
        password: 'dev-password'
      }
    ];
  }

  const raw = fs.readFileSync(usersFile, 'utf8');
  return usersSchema.parse(JSON.parse(raw));
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

const usersFile = resolveFromBackend(process.env.USERS_FILE ?? './data/users.json');

export const config = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:4200')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-change-me',
  ebookRoot: resolveFromBackend(process.env.EBOOK_ROOT ?? './library'),
  metadataPath: resolveFromBackend(process.env.METADATA_PATH ?? './data/books.json'),
  usersFile,
  users: loadUsers(usersFile),
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: readBoolean(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM
  }
};
