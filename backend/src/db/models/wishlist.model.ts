import { Schema, model } from 'mongoose';

export type WishlistStatus = 'pending' | 'fulfilled' | 'rejected';
export interface WishlistRecord {
  userId: string;
  userEmail: string;
  userName?: string;
  title: string;
  author: string;
  notes: string;
  key: string;
  status: WishlistStatus;
  notifyAfter: Date;
  notifiedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
const wishlistSchema = new Schema<WishlistRecord>({
  userId: { type: String, required: true },
  userEmail: { type: String, required: true },
  userName: String,
  title: { type: String, required: true },
  author: { type: String, default: '' },
  notes: { type: String, default: '' },
  key: { type: String, required: true },
  status: { type: String, enum: ['pending', 'fulfilled', 'rejected'], default: 'pending' },
  notifyAfter: { type: Date, required: true },
  notifiedAt: { type: Date, default: null }
}, { timestamps: true });
wishlistSchema.index({ userId: 1, key: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });
wishlistSchema.index({ userId: 1, createdAt: -1 });
wishlistSchema.index({ status: 1, notifiedAt: 1, notifyAfter: 1 });
export const WishlistModel = model<WishlistRecord>('Wishlist', wishlistSchema);

export interface WishlistMailItem {
  id: string;
  title: string;
  author: string;
  notes: string;
  userEmail: string;
  userName?: string;
  requestedAt: Date;
}
export interface WishlistBatch {
  id: string;
  requests: WishlistMailItem[];
  recipients: string[];
  deliveredTo: string[];
}
interface NotificationState {
  _id: string;
  owner?: string;
  lockedUntil: Date;
  batch?: WishlistBatch | null;
}
const mailItemSchema = new Schema<WishlistMailItem>({
  id: String, title: String, author: String, notes: String,
  userEmail: String, userName: String, requestedAt: Date
}, { _id: false });
const batchSchema = new Schema<WishlistBatch>({
  id: String, requests: [mailItemSchema], recipients: [String], deliveredTo: [String]
}, { _id: false });
const notificationStateSchema = new Schema<NotificationState>({
  _id: { type: String, required: true },
  owner: String,
  lockedUntil: { type: Date, required: true },
  batch: { type: batchSchema, default: null }
});
export const WishlistNotificationModel = model<NotificationState>('WishlistNotification', notificationStateSchema);
