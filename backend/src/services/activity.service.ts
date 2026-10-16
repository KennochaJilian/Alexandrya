import { z } from 'zod';
import { ActivityModel } from '../db/models/activity.model.js';
import type { Book } from '../models/book.js';
import type { PublicUser } from '../models/user.js';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12)
});

export async function recordActivity(book: Book, user: PublicUser, action: 'download' | 'kindle') {
  await ActivityModel.create({
    userId: user.id, userEmail: user.email, userName: user.name,
    bookId: book.id, title: book.title, authors: book.authors,
    coverUrl: book.coverUrl, format: book.format, action
  });
}

export async function listActivity(query: unknown, userId?: string) {
  const { page, pageSize } = querySchema.parse(query);
  const filter = userId ? { userId } : {};
  const [records, total] = await Promise.all([
    ActivityModel.find(filter).sort({ occurredAt: -1, _id: -1 })
      .skip((page - 1) * pageSize).limit(pageSize).lean(),
    ActivityModel.countDocuments(filter)
  ]);
  const activities = records.map(({ _id, userId: actorId, userEmail, userName, ...record }) => ({
    ...record, id: _id.toString(),
    ...(userId ? {} : { userId: actorId, userEmail, userName })
  }));
  return { activities, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}
