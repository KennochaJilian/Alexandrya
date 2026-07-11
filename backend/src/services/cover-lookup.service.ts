import { config } from '../config.js';
import { logger, serializeError } from '../utils/logger.js';

export interface CoverLookupInput {
  title: string;
  authors: string[];
}

export interface CoverLookupResult {
  coverUrl: string;
  coverSource: 'google-books' | 'open-library';
}

interface GoogleBooksResponse {
  items?: Array<{
    id?: string;
    volumeInfo?: {
      title?: string;
      authors?: string[];
      imageLinks?: Record<string, string>;
    };
  }>;
}

interface OpenLibraryResponse {
  docs?: Array<{
    title?: string;
    author_name?: string[];
    cover_i?: number;
  }>;
}

const imagePreference = [
  'extraLarge',
  'large',
  'medium',
  'small',
  'thumbnail',
  'smallThumbnail'
];

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function compactUnique(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function bestAuthor(authors: string[]): string | undefined {
  return authors.map((author) => author.trim()).find(Boolean);
}

function sameTitle(left: string | undefined, right: string): boolean {
  if (!left) {
    return false;
  }

  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);

  return normalizedLeft === normalizedRight
    || normalizedLeft.includes(normalizedRight)
    || normalizedRight.includes(normalizedLeft);
}

function sameAuthor(left: string[] | undefined, right: string | undefined): boolean {
  if (!right || !left?.length) {
    return true;
  }

  const normalizedRight = normalize(right);
  return left.some((author) => {
    const normalizedAuthor = normalize(author);
    return normalizedAuthor === normalizedRight
      || normalizedAuthor.includes(normalizedRight)
      || normalizedRight.includes(normalizedAuthor);
  });
}

function normalizeImageUrl(value: string): string {
  return value.replace(/^http:\/\//i, 'https://');
}

function safeExternalUrl(url: URL): string {
  const safeUrl = new URL(url);

  if (safeUrl.searchParams.has('key')) {
    safeUrl.searchParams.set('key', '[redacted]');
  }

  return safeUrl.toString();
}

async function fetchJson<T>(url: URL, provider: string): Promise<T | null> {
  const startedAt = performance.now();

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(config.coverLookupTimeoutMs),
      headers: {
        accept: 'application/json'
      }
    });
    const durationMs = Math.round(performance.now() - startedAt);

    if (!response.ok) {
      logger.warn('cover lookup request returned non-ok status', {
        provider,
        status: response.status,
        durationMs,
        url: safeExternalUrl(url)
      });
      return null;
    }

    return response.json() as Promise<T>;
  } catch (error) {
    logger.warn('cover lookup request failed', {
      provider,
      durationMs: Math.round(performance.now() - startedAt),
      timeoutMs: config.coverLookupTimeoutMs,
      url: safeExternalUrl(url),
      error: serializeError(error)
    });
    return null;
  }
}

function pickGoogleImage(imageLinks: Record<string, string> | undefined): string | undefined {
  if (!imageLinks) {
    return undefined;
  }

  const image = imagePreference.map((key) => imageLinks[key]).find(Boolean);
  return image ? normalizeImageUrl(image) : undefined;
}

async function lookupGoogleBooks(input: CoverLookupInput): Promise<CoverLookupResult | null> {
  const author = bestAuthor(input.authors);
  const normalizedTitle = normalize(input.title);
  const normalizedAuthor = author ? normalize(author) : undefined;
  const queries = compactUnique([
    author ? `intitle:${input.title} inauthor:${author}` : `intitle:${input.title}`,
    author ? `${input.title} ${author}` : input.title,
    normalizedAuthor ? `${normalizedTitle} ${normalizedAuthor}` : normalizedTitle
  ]);

  for (const query of queries) {
    const url = new URL('https://www.googleapis.com/books/v1/volumes');
    url.searchParams.set('q', query);
    url.searchParams.set('maxResults', '10');
    url.searchParams.set('printType', 'books');
    url.searchParams.set('projection', 'lite');
    url.searchParams.set('fields', 'items(id,volumeInfo(title,authors,imageLinks))');

    if (config.googleBooksApiKey) {
      url.searchParams.set('key', config.googleBooksApiKey);
    }

    const data = await fetchJson<GoogleBooksResponse>(url, 'google-books');
    const match = data?.items?.find((item) => {
      const info = item.volumeInfo;
      return sameTitle(info?.title, input.title) && sameAuthor(info?.authors, author) && pickGoogleImage(info?.imageLinks);
    }) ?? data?.items?.find((item) => sameAuthor(item.volumeInfo?.authors, author) && pickGoogleImage(item.volumeInfo?.imageLinks))
      ?? data?.items?.find((item) => pickGoogleImage(item.volumeInfo?.imageLinks));
    const coverUrl = pickGoogleImage(match?.volumeInfo?.imageLinks);

    if (coverUrl) {
      return { coverUrl, coverSource: 'google-books' };
    }
  }

  return null;
}

async function lookupOpenLibrary(input: CoverLookupInput): Promise<CoverLookupResult | null> {
  const author = bestAuthor(input.authors);
  const normalizedTitle = normalize(input.title);
  const normalizedAuthor = author ? normalize(author) : undefined;
  const queries = compactUnique([
    input.title,
    normalizedTitle
  ]);

  for (const title of queries) {
    const url = new URL('https://openlibrary.org/search.json');
    url.searchParams.set('title', title);
    url.searchParams.set('limit', '10');
    url.searchParams.set('fields', 'title,author_name,cover_i');

    if (author) {
      url.searchParams.set('author', author);
    }

    const data = await fetchJson<OpenLibraryResponse>(url, 'open-library');
    const match = data?.docs?.find((doc) => (
      doc.cover_i
      && sameTitle(doc.title, input.title)
      && sameAuthor(doc.author_name, author)
    )) ?? data?.docs?.find((doc) => doc.cover_i && sameAuthor(doc.author_name, author))
      ?? data?.docs?.find((doc) => doc.cover_i);

    if (match?.cover_i) {
      return {
        coverUrl: `https://covers.openlibrary.org/b/id/${match.cover_i}-L.jpg?default=false`,
        coverSource: 'open-library'
      };
    }
  }

  if (normalizedAuthor) {
    const url = new URL('https://openlibrary.org/search.json');
    url.searchParams.set('q', `${normalizedTitle} ${normalizedAuthor}`);
    url.searchParams.set('limit', '10');
    url.searchParams.set('fields', 'title,author_name,cover_i');
    const data = await fetchJson<OpenLibraryResponse>(url, 'open-library');
    const match = data?.docs?.find((doc) => doc.cover_i && sameAuthor(doc.author_name, author))
      ?? data?.docs?.find((doc) => doc.cover_i);

    if (match?.cover_i) {
      return {
        coverUrl: `https://covers.openlibrary.org/b/id/${match.cover_i}-L.jpg?default=false`,
        coverSource: 'open-library'
      };
    }
  }

  return null;
}

export async function lookupBookCover(input: CoverLookupInput): Promise<CoverLookupResult | null> {
  if (!config.coverLookupEnabled || !input.title.trim()) {
    return null;
  }

  try {
    const cover = await lookupGoogleBooks(input) ?? await lookupOpenLibrary(input);

    if (cover) {
      logger.debug('cover lookup found cover', {
        title: input.title,
        authors: input.authors,
        source: cover.coverSource
      });
    }

    return cover;
  } catch (error) {
    logger.warn('cover lookup failed', {
      title: input.title,
      authors: input.authors,
      error: serializeError(error)
    });
    return null;
  }
}
