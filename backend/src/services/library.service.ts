import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import type { Book, BookSearchFilters, PublicBook } from '../models/book.js';

const ebookExtensions = new Set(['.azw', '.azw3', '.epub', '.mobi', '.pdf', '.txt']);

const metadataSchema = z.array(z.object({
  id: z.string().optional(),
  relativePath: z.string().min(1),
  title: z.string().optional(),
  authors: z.array(z.string()).optional(),
  genres: z.array(z.string()).optional(),
  publishedDate: z.string().optional(),
  description: z.string().optional(),
  language: z.string().optional()
}));

type BookMetadata = z.infer<typeof metadataSchema>[number];

let cache: Book[] | null = null;

function normalizeRelativePath(value: string): string {
  return value.replaceAll('\\', '/');
}

function createId(relativePath: string): string {
  return crypto.createHash('sha1').update(relativePath).digest('hex').slice(0, 16);
}

function parseFileName(fileName: string) {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension).replaceAll('_', ' ').trim();
  const yearMatch = baseName.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  const withoutYear = baseName
    .replace(/\s*\((1[5-9]\d{2}|20\d{2})\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = withoutYear.split(/\s+-\s+/);

  if (parts.length >= 2) {
    const [author, ...titleParts] = parts;
    return {
      title: titleParts.join(' - '),
      authors: author ? [author] : [],
      publishedDate: yearMatch ? `${yearMatch[0]}-01-01` : undefined
    };
  }

  return {
    title: withoutYear || fileName,
    authors: [],
    publishedDate: yearMatch ? `${yearMatch[0]}-01-01` : undefined
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readMetadata(): Promise<BookMetadata[]> {
  if (!(await fileExists(config.metadataPath))) {
    return [];
  }

  const raw = await fs.readFile(config.metadataPath, 'utf8');
  return metadataSchema.parse(JSON.parse(raw));
}

async function walkEbooks(directory: string): Promise<string[]> {
  if (!(await fileExists(directory))) {
    return [];
  }

  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return walkEbooks(fullPath);
    }

    if (entry.isFile() && ebookExtensions.has(path.extname(entry.name).toLowerCase())) {
      return [fullPath];
    }

    return [];
  }));

  return files.flat();
}

function toPublicBook(book: Book): PublicBook {
  const { filePath: _filePath, ...publicBook } = book;
  return publicBook;
}

async function loadBooks(): Promise<Book[]> {
  const metadata = await readMetadata();
  const metadataByPath = new Map(
    metadata.map((item) => [normalizeRelativePath(item.relativePath), item])
  );
  const ebookFiles = await walkEbooks(config.ebookRoot);

  const books = await Promise.all(ebookFiles.map(async (filePath) => {
    const relativePath = normalizeRelativePath(path.relative(config.ebookRoot, filePath));
    const fileName = path.basename(filePath);
    const stats = await fs.stat(filePath);
    const inferred = parseFileName(fileName);
    const metadataItem = metadataByPath.get(relativePath);

    return {
      id: metadataItem?.id ?? createId(relativePath),
      title: metadataItem?.title ?? inferred.title,
      authors: metadataItem?.authors ?? inferred.authors,
      genres: metadataItem?.genres ?? [],
      publishedDate: metadataItem?.publishedDate ?? inferred.publishedDate,
      description: metadataItem?.description,
      language: metadataItem?.language,
      format: path.extname(fileName).slice(1).toLowerCase(),
      fileName,
      relativePath,
      filePath,
      sizeBytes: stats.size
    } satisfies Book;
  }));

  return books.sort((left, right) => left.title.localeCompare(right.title, 'fr'));
}

export async function refreshLibrary(): Promise<PublicBook[]> {
  cache = await loadBooks();
  return cache.map(toPublicBook);
}

async function getLibrary(): Promise<Book[]> {
  cache ??= await loadBooks();
  return cache;
}

function includes(value: string | undefined, search: string | undefined): boolean {
  if (!search) {
    return true;
  }

  return value?.toLowerCase().includes(search.toLowerCase()) ?? false;
}

function matchesPublishedDate(bookDate: string | undefined, from?: string, to?: string): boolean {
  if (!from && !to) {
    return true;
  }

  if (!bookDate) {
    return false;
  }

  if (from && bookDate < from) {
    return false;
  }

  return !(to && bookDate > to);
}

function matchesQuery(book: Book, query: string | undefined): boolean {
  if (!query) {
    return true;
  }

  const normalized = query.toLowerCase();
  const values = [
    book.title,
    book.authors.join(' '),
    book.genres.join(' '),
    book.publishedDate,
    book.description,
    book.fileName
  ];

  return values.some((value) => value?.toLowerCase().includes(normalized));
}

export async function searchBooks(filters: BookSearchFilters): Promise<PublicBook[]> {
  const books = await getLibrary();

  return books
    .filter((book) => matchesQuery(book, filters.q))
    .filter((book) => includes(book.title, filters.title))
    .filter((book) => includes(book.authors.join(' '), filters.author))
    .filter((book) => includes(book.genres.join(' '), filters.genre))
    .filter((book) => matchesPublishedDate(book.publishedDate, filters.publishedFrom, filters.publishedTo))
    .map(toPublicBook);
}

export async function getBook(id: string): Promise<PublicBook> {
  const books = await getLibrary();
  const book = books.find((candidate) => candidate.id === id);

  if (!book) {
    throw new HttpError(404, 'BOOK_NOT_FOUND', 'Livre introuvable.');
  }

  return toPublicBook(book);
}

export async function getBookFile(id: string): Promise<Book> {
  const books = await getLibrary();
  const book = books.find((candidate) => candidate.id === id);

  if (!book) {
    throw new HttpError(404, 'BOOK_NOT_FOUND', 'Livre introuvable.');
  }

  return book;
}
