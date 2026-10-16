import { z } from 'zod';
import { WishlistModel, type WishlistStatus } from '../db/models/wishlist.model.js';
import { HttpError } from '../errors.js';
import type { PublicUser } from '../models/user.js';
import { nextWishlistDigest } from './wishlist-schedule.js';

export const wishlistInputSchema = z.object({
  title: z.string().trim().min(1).max(250),
  author: z.string().trim().max(200).default(''),
  notes: z.string().trim().max(1000).default('')
});
const listSchema = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) });
export const wishlistStatusSchema = z.object({ status: z.enum(['pending', 'fulfilled', 'rejected']) });

function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function duplicate(error: unknown): never {
  if ((error as { code?: number })?.code === 11000) {
    throw new HttpError(409, 'WISHLIST_DUPLICATE', 'Une demande en attente existe déjà pour ce livre.');
  }
  throw error;
}

export async function createWishlistRequest(user: PublicUser, body: unknown) {
  const input = wishlistInputSchema.parse(body);
  try {
    const request = await WishlistModel.create({
      ...input, userId: user.id, userEmail: user.email, userName: user.name,
      key: JSON.stringify([normalize(input.title), normalize(input.author)]),
      notifyAfter: nextWishlistDigest(new Date())
    });
    return { id: request._id.toString() };
  } catch (error) { return duplicate(error); }
}

export async function listWishlist(query: unknown, userId?: string) {
  const { page } = listSchema.parse(query);
  const pageSize = 12;
  const filter = userId ? { userId } : {};
  const [records, total] = await Promise.all([
    WishlistModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    WishlistModel.countDocuments(filter)
  ]);
  return {
    requests: records.map(record => ({
      id: record._id.toString(), title: record.title, author: record.author, notes: record.notes,
      status: record.status, createdAt: record.createdAt,
      ...(userId ? {} : { userName: record.userName, userEmail: record.userEmail, notifiedAt: record.notifiedAt })
    })), total, page, totalPages: Math.ceil(total / pageSize)
  };
}

export async function updateWishlistStatus(id: string, status: WishlistStatus) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(404, 'WISHLIST_NOT_FOUND', 'Demande introuvable.');
  try {
    const result = await WishlistModel.updateOne({ _id: id }, { $set: { status } }, { runValidators: true });
    if (!result.matchedCount) throw new HttpError(404, 'WISHLIST_NOT_FOUND', 'Demande introuvable.');
  } catch (error) { duplicate(error); }
}
