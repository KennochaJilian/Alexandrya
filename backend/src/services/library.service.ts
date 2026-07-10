import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { type Types } from 'mongoose';
import { config } from '../config.js';
import { AuthorModel } from '../db/models/author.model.js';
import { BookModel, type BookRecord } from '../db/models/book.model.js';
import { GenreModel } from '../db/models/genre.model.js';
import { HttpError } from '../errors.js';
import type { Book, BookSearchFilters, PublicBook } from '../models/book.js';
import { slugify } from '../utils/slug.js';
import { lookupBookCover } from './cover-lookup.service.js';
import { type EmbeddedCoverImage, readEbookMetadata } from './ebook-metadata.service.js';
import { indexBooksInTypesense, searchBooksInTypesense } from './typesense.service.js';

const ebookExtensions = new Set(['.azw', '.azw3', '.epub', '.mobi', '.pdf', '.txt']);

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
    const author = config.ebookFilenamePattern === 'author-title'
      ? parts[0]
      : parts.at(-1);
    const titleParts = config.ebookFilenamePattern === 'author-title'
      ? parts.slice(1)
      : parts.slice(0, -1);

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

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

async function upsertAuthors(names: string[]) {
  const docs = await Promise.all(unique(names).map((name) => AuthorModel.findOneAndUpdate(
    { slug: slugify(name) },
    { $setOnInsert: { name, slug: slugify(name) } },
    { upsert: true, new: true }
  )));

  return {
    ids: docs.map((doc) => doc._id as Types.ObjectId),
    names: docs.map((doc) => doc.name)
  };
}

async function upsertGenres(names: string[]) {
  const docs = await Promise.all(unique(names).map((name) => GenreModel.findOneAndUpdate(
    { slug: slugify(name) },
    { $setOnInsert: { name, slug: slugify(name) } },
    { upsert: true, new: true }
  )));

  return {
    ids: docs.map((doc) => doc._id as Types.ObjectId),
    names: docs.map((doc) => doc.name)
  };
}

async function saveEmbeddedCover(publicId: string, coverImage: EmbeddedCoverImage) {
  await fs.mkdir(config.coverStoragePath, { recursive: true });

  const extension = coverImage.extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  const fileName = `${publicId}.${extension}`;
  await fs.writeFile(path.join(config.coverStoragePath, fileName), coverImage.bytes);

  return {
    coverUrl: `${config.coverPublicPath}/${fileName}`,
    coverSource: 'embedded-epub'
  };
}

function toPublicBook(book: BookRecord): PublicBook {
  return {
    id: book.publicId,
    title: book.title,
    authors: book.authorNames,
    genres: book.genreNames,
    publishedDate: book.publishedDate,
    description: book.description,
    language: book.language,
    format: book.format,
    fileName: book.fileName,
    relativePath: book.relativePath,
    sizeBytes: book.sizeBytes,
    coverUrl: book.coverUrl,
    coverSource: book.coverSource
  };
}

function toBookWithFile(book: BookRecord): Book {
  return {
    ...toPublicBook(book),
    filePath: book.filePath
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textRegex(value: string): RegExp {
  return new RegExp(escapeRegex(value.trim()), 'i');
}

function buildQuery(filters: BookSearchFilters): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];

  if (filters.q?.trim()) {
    const search = textRegex(filters.q);
    and.push({
      $or: [
        { title: search },
        { authorNames: search },
        { genreNames: search },
        { publishedDate: search },
        { description: search },
        { fileName: search }
      ]
    });
  }

  if (filters.title?.trim()) {
    and.push({ title: textRegex(filters.title) });
  }

  if (filters.author?.trim()) {
    and.push({ authorNames: textRegex(filters.author) });
  }

  if (filters.genre?.trim()) {
    and.push({ genreNames: textRegex(filters.genre) });
  }

  if (filters.publishedFrom || filters.publishedTo) {
    const range: Record<string, string> = {};

    if (filters.publishedFrom) {
      range.$gte = filters.publishedFrom;
    }

    if (filters.publishedTo) {
      range.$lte = filters.publishedTo;
    }

    and.push({ publishedDate: range });
  }

  return and.length ? { $and: and } : {};
}

export async function refreshLibrary(): Promise<PublicBook[]> {
  const ebookFiles = await walkEbooks(config.ebookRoot);

  await Promise.all(ebookFiles.map(async (filePath) => {
    const relativePath = normalizeRelativePath(path.relative(config.ebookRoot, filePath));
    const publicId = createId(relativePath);
    const fileName = path.basename(filePath);
    const stats = await fs.stat(filePath);
    const inferred = parseFileName(fileName);
    const embeddedMetadata = await readEbookMetadata(filePath);
    const title = embeddedMetadata.title ?? inferred.title;
    const authors = embeddedMetadata.authors.length ? embeddedMetadata.authors : inferred.authors;
    const genres = embeddedMetadata.genres;
    const publishedDate = embeddedMetadata.publishedDate ?? inferred.publishedDate;
    const authorRefs = await upsertAuthors(authors);
    const genreRefs = await upsertGenres(genres);
    const existingBook = await BookModel.findOne({ relativePath }, { coverUrl: 1, coverSource: 1 }).lean();
    const cover = embeddedMetadata.coverImage
      ? await saveEmbeddedCover(publicId, embeddedMetadata.coverImage)
      : existingBook?.coverUrl
      ? {
          coverUrl: existingBook.coverUrl,
          coverSource: existingBook.coverSource
        }
      : await lookupBookCover({ title, authors });
    const updateSet: Partial<BookRecord> = {
      title,
      authors: authorRefs.ids,
      authorNames: authorRefs.names,
      genres: genreRefs.ids,
      genreNames: genreRefs.names,
      publishedDate,
      description: embeddedMetadata.description,
      language: embeddedMetadata.language,
      format: path.extname(fileName).slice(1).toLowerCase(),
      fileName,
      relativePath,
      filePath,
      sizeBytes: stats.size,
      lastScannedAt: new Date()
    };

    if (cover?.coverUrl) {
      updateSet.coverUrl = cover.coverUrl;
      updateSet.coverSource = cover.coverSource;
    }

    await BookModel.findOneAndUpdate(
      { relativePath },
      {
        $set: updateSet,
        $setOnInsert: {
          publicId
        }
      },
      { upsert: true, new: true }
    );
  }));

  const books = await searchBooksInMongo({});
  await indexBooksInTypesense(books);

  return books;
}

export async function searchBooks(filters: BookSearchFilters): Promise<PublicBook[]> {
  const typesenseBooks = await searchBooksInTypesense(filters);

  if (typesenseBooks) {
    return typesenseBooks;
  }

  return searchBooksInMongo(filters);
}

async function searchBooksInMongo(filters: BookSearchFilters): Promise<PublicBook[]> {
  const books = await BookModel.find(buildQuery(filters))
    .sort({ updatedAt: -1, title: 1 })
    .lean();

  return books.map(toPublicBook);
}

export async function syncSearchIndex(): Promise<{ total: number; indexed: boolean }> {
  const books = await searchBooksInMongo({});
  const indexed = await indexBooksInTypesense(books);

  return {
    total: books.length,
    indexed
  };
}

export async function getBook(id: string): Promise<PublicBook> {
  const book = await BookModel.findOne({ publicId: id }).lean();

  if (!book) {
    throw new HttpError(404, 'BOOK_NOT_FOUND', 'Livre introuvable.');
  }

  return toPublicBook(book);
}

export async function getBookFile(id: string): Promise<Book> {
  const book = await BookModel.findOne({ publicId: id }).lean();

  if (!book) {
    throw new HttpError(404, 'BOOK_NOT_FOUND', 'Livre introuvable.');
  }

  return toBookWithFile(book);
}
