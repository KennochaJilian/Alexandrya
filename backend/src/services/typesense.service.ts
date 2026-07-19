import {
  Client as TypesenseClient,
  Errors,
  type CollectionCreateSchema,
  type SearchParams
} from 'typesense';
import { config } from '../config.js';
import type { BookSearchFilters, PublicBook } from '../models/book.js';
import { logger, serializeError } from '../utils/logger.js';

type BookSearchDocument = PublicBook & {
  id: string;
  authors: string[];
  genres: string[];
};

const collectionSchema: CollectionCreateSchema = {
  name: config.typesense.collection,
  fields: [
    { name: 'title', type: 'string', locale: 'fr' },
    { name: 'authors', type: 'string[]', facet: true, locale: 'fr' },
    { name: 'genres', type: 'string[]', facet: true, locale: 'fr' },
    { name: 'publishedDate', type: 'string', optional: true, facet: true },
    { name: 'description', type: 'string', optional: true, locale: 'fr' },
    { name: 'language', type: 'string', optional: true, facet: true },
    { name: 'coverUrl', type: 'string', optional: true },
    { name: 'coverSource', type: 'string', optional: true, facet: true },
    { name: 'format', type: 'string', facet: true },
    { name: 'fileName', type: 'string' },
    { name: 'relativePath', type: 'string' },
    { name: 'sizeBytes', type: 'int64' }
  ]
};

let client: TypesenseClient | undefined;
let collectionReady = false;
let warningAlreadyShown = false;

function getClient(): TypesenseClient | undefined {
  if (!config.typesense.enabled) {
    return undefined;
  }

  client ??= new TypesenseClient({
    nodes: [{
      host: config.typesense.host,
      port: config.typesense.port,
      protocol: config.typesense.protocol
    }],
    apiKey: config.typesense.apiKey,
    connectionTimeoutSeconds: 2,
    numRetries: 1,
    retryIntervalSeconds: 0.2
  });

  return client;
}

function warnTypesenseUnavailable(action: string, error: unknown): void {
  if (warningAlreadyShown) {
    return;
  }

  logger.warn('typesense unavailable', {
    action,
    error: serializeError(error)
  });
  warningAlreadyShown = true;
}

async function ensureCollection(clientInstance: TypesenseClient): Promise<void> {
  if (collectionReady) {
    return;
  }

  try {
    await clientInstance.collections(config.typesense.collection).retrieve();
  } catch (error) {
    if (!(error instanceof Errors.ObjectNotFound)) {
      throw error;
    }

    await clientInstance.collections().create(collectionSchema);
  }

  collectionReady = true;
}

function removeUndefinedValues(document: BookSearchDocument): BookSearchDocument {
  return Object.fromEntries(
    Object.entries(document).filter(([, value]) => value !== undefined)
  ) as BookSearchDocument;
}

function toSearchDocument(book: PublicBook): BookSearchDocument {
  return removeUndefinedValues({
    id: book.id,
    title: book.title,
    authors: book.authors,
    genres: book.genres,
    publishedDate: book.publishedDate,
    description: book.description,
    language: book.language,
    coverUrl: book.coverUrl,
    coverSource: book.coverSource,
    format: book.format,
    fileName: book.fileName,
    relativePath: book.relativePath,
    sizeBytes: book.sizeBytes
  });
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function includesFilter(value: string | undefined, filter: string | undefined): boolean {
  if (!filter?.trim()) {
    return true;
  }

  return normalize(value ?? '').includes(normalize(filter));
}

function arrayIncludesFilter(values: string[], filter: string | undefined): boolean {
  if (!filter?.trim()) {
    return true;
  }

  return values.some((value) => includesFilter(value, filter));
}

function matchesDateRange(book: PublicBook, filters: BookSearchFilters): boolean {
  if (!filters.publishedFrom && !filters.publishedTo) {
    return true;
  }

  if (!book.publishedDate) {
    return false;
  }

  if (filters.publishedFrom && book.publishedDate < filters.publishedFrom) {
    return false;
  }

  return !(filters.publishedTo && book.publishedDate > filters.publishedTo);
}

function matchesStructuredFilters(book: PublicBook, filters: BookSearchFilters): boolean {
  return includesFilter(book.title, filters.title)
    && arrayIncludesFilter(book.authors, filters.author)
    && arrayIncludesFilter(book.genres, filters.genre)
    && matchesDateRange(book, filters);
}

function buildSearchQuery(filters: BookSearchFilters): string {
  return [
    filters.q,
    filters.title,
    filters.author,
    filters.genre
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(' ') || '*';
}

function hasSearchText(filters: BookSearchFilters): boolean {
  return Boolean(
    filters.q?.trim()
    || filters.title?.trim()
    || filters.author?.trim()
    || filters.genre?.trim()
  );
}

function buildSearchParameters(
  query: string,
  page: number,
  perPage: number,
  includeDescription: boolean
): SearchParams<BookSearchDocument> {
  return {
    q: query,
    query_by: includeDescription
      ? 'title,authors,genres,publishedDate,fileName,description'
      : 'title,authors,genres,publishedDate,fileName',
    query_by_weights: includeDescription
      ? '5,5,3,2,1,1'
      : '5,5,3,2,1',
    page,
    per_page: perPage,
    prefix: true,
    num_typos: 2,
    split_join_tokens: 'fallback',
    text_match_type: 'max_weight'
  };
}

async function runTypesenseSearch(
  clientInstance: TypesenseClient,
  query: string,
  includeDescription: boolean
): Promise<PublicBook[]> {
  const perPage = 250;
  const books: PublicBook[] = [];
  let page = 1;
  let found = 0;

  do {
    const response = await clientInstance
      .collections<BookSearchDocument>(config.typesense.collection)
      .documents()
      .search(buildSearchParameters(query, page, perPage, includeDescription), {});

    found = response.found;
    books.push(...(response.hits ?? []).map((hit) => hit.document));
    page += 1;
  } while ((page - 1) * perPage < found);

  return books;
}

export async function indexBooksInTypesense(books: PublicBook[]): Promise<boolean> {
  const clientInstance = getClient();

  if (!clientInstance) {
    return false;
  }

  try {
    await ensureCollection(clientInstance);

    if (!books.length) {
      return true;
    }

    const results = await clientInstance
      .collections<BookSearchDocument>(config.typesense.collection)
      .documents()
      .import(books.map(toSearchDocument), { action: 'upsert', throwOnFail: true });

    const failedImports = Array.isArray(results)
      ? results.filter((result) => !result.success)
      : [];

    if (failedImports.length) {
      logger.warn('typesense import partially failed', {
        failed: failedImports.length
      });
    }

    return true;
  } catch (error) {
    warnTypesenseUnavailable('indexation', error);
    return false;
  }
}

export async function deleteBookFromTypesense(id: string): Promise<boolean> {
  const clientInstance = getClient();

  if (!clientInstance) {
    return false;
  }

  try {
    await ensureCollection(clientInstance);
    await clientInstance
      .collections<BookSearchDocument>(config.typesense.collection)
      .documents(id)
      .delete();

    return true;
  } catch (error) {
    if (error instanceof Errors.ObjectNotFound) {
      return true;
    }

    warnTypesenseUnavailable('suppression', error);
    return false;
  }
}

export async function searchBooksInTypesense(filters: BookSearchFilters): Promise<PublicBook[] | null> {
  const clientInstance = getClient();

  if (!clientInstance || !hasSearchText(filters)) {
    return null;
  }

  try {
    await ensureCollection(clientInstance);

    const query = buildSearchQuery(filters);
    const books = await runTypesenseSearch(clientInstance, query, false);
    const filteredBooks = books.filter((book) => matchesStructuredFilters(book, filters));

    if (filteredBooks.length) {
      return filteredBooks;
    }

    const booksWithDescriptionFallback = await runTypesenseSearch(clientInstance, query, true);
    return booksWithDescriptionFallback.filter((book) => matchesStructuredFilters(book, filters));
  } catch (error) {
    warnTypesenseUnavailable('recherche', error);
    return null;
  }
}
