import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

export interface EbookMetadata {
  title?: string;
  authors: string[];
  genres: string[];
  publishedDate?: string;
  description?: string;
  language?: string;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  trimValues: true
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function textValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.trim() || undefined;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (value && typeof value === 'object' && '#text' in value) {
    return textValue((value as { '#text'?: unknown })['#text']);
  }

  return undefined;
}

function textValues(value: unknown): string[] {
  return asArray(value)
    .map(textValue)
    .filter((item): item is string => Boolean(item));
}

function splitSubjects(values: string[]): string[] {
  return values.flatMap((value) => value.split(/[;|]/g))
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const yearMonthDay = value.match(/\d{4}-\d{2}-\d{2}/);
  if (yearMonthDay) {
    return yearMonthDay[0];
  }

  const year = value.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  return year ? `${year[0]}-01-01` : undefined;
}

function normalizeDescription(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const description = value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  return description || undefined;
}

async function readZipText(zip: JSZip, filePath: string): Promise<string | undefined> {
  return zip.file(filePath)?.async('text');
}

function getRootfilePath(containerXml: string): string | undefined {
  const parsed = xmlParser.parse(containerXml) as {
    container?: {
      rootfiles?: {
        rootfile?: { '@_full-path'?: string } | Array<{ '@_full-path'?: string }>;
      };
    };
  };
  const rootfile = asArray(parsed.container?.rootfiles?.rootfile)[0];
  return rootfile?.['@_full-path'];
}

function parseOpf(opfXml: string): EbookMetadata {
  const parsed = xmlParser.parse(opfXml) as {
    package?: {
      metadata?: Record<string, unknown>;
    };
  };
  const metadata = parsed.package?.metadata ?? {};
  const subjects = textValues(metadata.subject);

  return {
    title: textValue(metadata.title),
    authors: textValues(metadata.creator),
    genres: splitSubjects(subjects),
    publishedDate: normalizeDate(textValue(metadata.date)),
    description: normalizeDescription(textValue(metadata.description)),
    language: textValue(metadata.language)
  };
}

export async function readEbookMetadata(filePath: string): Promise<EbookMetadata> {
  if (path.extname(filePath).toLowerCase() !== '.epub') {
    return {
      authors: [],
      genres: []
    };
  }

  try {
    const zip = await JSZip.loadAsync(await fs.readFile(filePath));
    const containerXml = await readZipText(zip, 'META-INF/container.xml');

    if (!containerXml) {
      return {
        authors: [],
        genres: []
      };
    }

    const rootfilePath = getRootfilePath(containerXml);

    if (!rootfilePath) {
      return {
        authors: [],
        genres: []
      };
    }

    const opfXml = await readZipText(zip, rootfilePath);

    if (!opfXml) {
      return {
        authors: [],
        genres: []
      };
    }

    return parseOpf(opfXml);
  } catch {
    return {
      authors: [],
      genres: []
    };
  }
}
