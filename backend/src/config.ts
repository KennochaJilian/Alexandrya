import 'dotenv/config';
import path from 'node:path';

function resolveFromBackend(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function readFilenamePattern(value: string | undefined): 'title-author' | 'author-title' {
  return value === 'author-title' ? 'author-title' : 'title-author';
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:4200')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-change-me',
  mongoUri: process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/alexandrya',
  mongoDbName: process.env.MONGO_DB_NAME,
  ebookRoot: resolveFromBackend(process.env.EBOOK_ROOT ?? './library'),
  ebookFilenamePattern: readFilenamePattern(process.env.EBOOK_FILENAME_PATTERN),
  coverLookupEnabled: readBoolean(process.env.COVER_LOOKUP_ENABLED, true),
  googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY,
  coverStoragePath: resolveFromBackend(process.env.COVER_STORAGE_PATH ?? './data/covers'),
  coverPublicPath: process.env.COVER_PUBLIC_PATH ?? '/covers',
  typesense: {
    enabled: readBoolean(process.env.TYPESENSE_ENABLED, false),
    host: process.env.TYPESENSE_HOST ?? '127.0.0.1',
    port: Number(process.env.TYPESENSE_PORT ?? 8108),
    protocol: process.env.TYPESENSE_PROTOCOL ?? 'http',
    apiKey: process.env.TYPESENSE_API_KEY ?? 'xyz',
    collection: process.env.TYPESENSE_COLLECTION ?? 'books'
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: readBoolean(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM
  }
};
