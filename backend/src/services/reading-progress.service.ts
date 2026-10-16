import { z } from 'zod';
import { ReadingProgressModel } from '../db/models/reading-progress.model.js';
import { BookModel } from '../db/models/book.model.js';
import { HttpError } from '../errors.js';
import { getBook } from './library.service.js';

const common = {
  label: z.string().trim().min(1).max(200),
  completed: z.boolean().default(false)
};
export const readingProgressSchema = z.discriminatedUnion('format', [
  z.object({ ...common, format: z.literal('epub'), cfi: z.string().max(4096).regex(/^epubcfi\(.+\)$/) }),
  z.object({ ...common, format: z.literal('pdf'), page: z.number().int().min(1).max(100000),
    totalPages: z.number().int().min(1).max(100000), scroll: z.number().min(0).max(1).default(0)
  }).refine(value => value.page <= value.totalPages, { message: 'Page invalide.' })
]);

function publicProgress(record: { format: string; cfi?: string | null; page?: number | null; totalPages?: number | null; scroll?: number | null; label: string; completed: boolean; updatedAt: Date }) {
  return {
    format: record.format, cfi: record.cfi, page: record.page, totalPages: record.totalPages,
    scroll: record.scroll, label: record.label, completed: record.completed, updatedAt: record.updatedAt
  };
}

export async function getReadingProgress(userId: string, bookId: string) {
  const record = await ReadingProgressModel.findOne({ userId, bookId }).lean();
  return record ? publicProgress(record) : null;
}

export async function saveReadingProgress(userId: string, bookId: string, input: unknown) {
  const progress = readingProgressSchema.parse(input);
  const book = await getBook(bookId);
  if (book.format.toLowerCase() !== progress.format) {
    throw new HttpError(400, 'READING_FORMAT_MISMATCH', 'Le format de la position ne correspond pas au livre.');
  }
  await ReadingProgressModel.updateOne({ userId, bookId }, { $set: progress }, { upsert: true, runValidators: true });
}

export async function listCurrentReadings(userId: string) {
  // Join before sorting/limiting so deleted or unsupported books never occupy the shelf.
  const readings = await ReadingProgressModel.aggregate([
    { $match: { userId, completed: false } },
    { $lookup: { from: BookModel.collection.name, localField: 'bookId', foreignField: 'publicId', as: 'book' } },
    { $unwind: '$book' },
    { $match: { 'book.format': { $in: ['epub', 'pdf'] } } },
    { $sort: { updatedAt: -1, _id: -1 } },
    { $project: {
      _id: 0, bookId: 1, format: 1, cfi: 1, page: 1, totalPages: 1, scroll: 1, label: 1, updatedAt: 1,
      book: { id: '$book.publicId', title: '$book.title', authors: '$book.authorNames', coverUrl: '$book.coverUrl', format: '$book.format' }
    } }
  ]);
  return { readings };
}
