import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { UserModel } from '../db/models/user.model.js';
import { WishlistModel, WishlistNotificationModel, type WishlistBatch } from '../db/models/wishlist.model.js';
import { logger, serializeError } from '../utils/logger.js';

export const WISHLIST_THRESHOLD = 5;
const STATE_ID = 'wishlist';
const LEASE_MS = 120000;
const pendingFilter = { status: 'pending', notifiedAt: null } as const;

export interface WishlistNotificationStore {
  acquire(): Promise<boolean>;
  renew(): Promise<boolean>;
  release(): Promise<void>;
  loadBatch(): Promise<WishlistBatch | null>;
  pendingInfo(now: Date): Promise<{ count: number; due: boolean }>;
  createBatch(): Promise<WishlistBatch | null>;
  markDelivered(email: string): Promise<void>;
  completeBatch(batch: WishlistBatch, now: Date): Promise<void>;
}

// The persistent batch and per-recipient acknowledgements survive API restarts.
export async function processWishlistNotifications(
  store: WishlistNotificationStore,
  send: (email: string, batch: WishlistBatch) => Promise<void>,
  now = new Date()
) {
  if (!await store.acquire()) return;
  try {
    let batch = await store.loadBatch();
    if (!batch) {
      const pending = await store.pendingInfo(now);
      if (!pending.count || (pending.count < WISHLIST_THRESHOLD && !pending.due)) return;
      batch = await store.createBatch();
    }
    if (!batch) return;
    const failures: unknown[] = [];
    for (const email of batch.recipients) {
      if (batch.deliveredTo.includes(email)) continue;
      if (!await store.renew()) throw new Error('Wishlist notification lease lost');
      try {
        await send(email, batch);
        await store.markDelivered(email);
        batch.deliveredTo.push(email);
      } catch (error) { failures.push(error); }

    }
    if (failures.length) throw new AggregateError(failures, 'Some wishlist emails could not be sent');
    if (!await store.renew()) throw new Error('Wishlist notification lease lost');
    await store.completeBatch(batch, now);
  } finally { await store.release(); }
}

function mongoStore(): WishlistNotificationStore {
  const owner = crypto.randomUUID();
  const owned = { _id: STATE_ID, owner };
  const lease = () => new Date(Date.now() + LEASE_MS);
  const check = (result: { matchedCount: number }) => {
    if (!result.matchedCount) throw new Error('Wishlist notification lease lost');
  };
  return {
    async acquire() {
      try {
        await WishlistNotificationModel.updateOne({ _id: STATE_ID }, {
          $setOnInsert: { lockedUntil: new Date(0) }
        }, { upsert: true });
      } catch (error) {
        if ((error as { code?: number })?.code !== 11000) throw error;
      }
      const state = await WishlistNotificationModel.findOneAndUpdate({
        _id: STATE_ID, lockedUntil: { $lte: new Date() }
      }, { $set: { owner, lockedUntil: lease() } }, { new: true }).lean();
      return Boolean(state);
    },
    async renew() {
      const result = await WishlistNotificationModel.updateOne(owned, { $set: { lockedUntil: lease() } });
      return result.matchedCount === 1;
    },
    async release() {
      await WishlistNotificationModel.updateOne(owned, { $set: { lockedUntil: new Date(0) }, $unset: { owner: 1 } });
    },
    async loadBatch() {
      const state = await WishlistNotificationModel.findOne(owned).lean();
      return state?.batch ?? null;
    },
    async pendingInfo(now) {
      const [count, due] = await Promise.all([
        WishlistModel.countDocuments(pendingFilter),
        WishlistModel.exists({ ...pendingFilter, notifyAfter: { $lte: now } })
      ]);
      return { count, due: Boolean(due) };
    },
    async createBatch() {
      const [records, admins] = await Promise.all([
        WishlistModel.find(pendingFilter).sort({ createdAt: 1, _id: 1 }).limit(100).lean(),
        UserModel.find({ role: 'admin' }).select('email').lean()
      ]);
      const recipients = [...new Set(admins.map(admin => admin.email))];
      if (!records.length || !recipients.length) return null;
      const batch: WishlistBatch = {
        id: crypto.randomUUID(), recipients, deliveredTo: [],
        requests: records.map(record => ({
          id: record._id.toString(), title: record.title, author: record.author,
          notes: record.notes, userEmail: record.userEmail, userName: record.userName, requestedAt: record.createdAt
        }))
      };
      check(await WishlistNotificationModel.updateOne(owned, { $set: { batch } }));
      return batch;
    },
    async markDelivered(email) {
      check(await WishlistNotificationModel.updateOne(owned, { $addToSet: { 'batch.deliveredTo': email } }));
    },
    async completeBatch(batch, now) {
      await WishlistModel.updateMany({ _id: { $in: batch.requests.map(request => request.id) }, notifiedAt: null }, { $set: { notifiedAt: now } });
      check(await WishlistNotificationModel.updateOne(owned, { $set: { batch: null } }));
      logger.info('wishlist notification batch completed', { batchId: batch.id, requests: batch.requests.length, admins: batch.recipients.length });
    }
  };
}

export function wishlistMailText(batch: WishlistBatch): string {
  const dateFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });
  const items = batch.requests.map((request, index) => [
    `${index + 1}. ${request.title}${request.author ? ` — ${request.author}` : ''}`,
    `Demandé par ${request.userName ? request.userName + ' — ' : ''}${request.userEmail}`,
    `Le ${dateFormat.format(new Date(request.requestedAt))}`,
    ...(request.notes ? [`Précisions : ${request.notes}`] : [])
  ].join('\n'));
  return [
    `${batch.requests.length} nouvelle(s) demande(s) de livres sur Alexandrya.`,
    ...items,
    'Ouvrez la wishlist dans la console d’administration pour suivre les demandes et les marquer comme ajoutées ou refusées.'
  ].join('\n\n');
}

export function wishlistMailConfigured() { return Boolean(config.smtp.host && config.smtp.from); }
let running = false;
export async function runWishlistNotifications() {
  if (running || !wishlistMailConfigured()) return;
  running = true;
  const transport = nodemailer.createTransport({
    host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure,
    auth: config.smtp.user && config.smtp.pass ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000
  });
  try {
    await processWishlistNotifications(mongoStore(), async (email, batch) => {
      const result = await transport.sendMail({
        from: config.smtp.from, to: email,
        messageId: `<wishlist-${batch.id}-${crypto.createHash('sha256').update(email).digest('hex').slice(0, 16)}@alexandrya.local>`,
        subject: `Alexandrya — ${batch.requests.length} demande(s) de livres`,
        text: wishlistMailText(batch), disableFileAccess: true, disableUrlAccess: true
      });
      if (!result.accepted?.length) throw new Error('Wishlist email recipient rejected by SMTP');
    });
  } catch (error) {
    logger.error('wishlist notifications failed; requests retained for retry', { error: serializeError(error) });
  } finally { transport.close(); running = false; }
}

export function startWishlistNotificationScheduler() {
  if (!wishlistMailConfigured()) logger.warn('wishlist emails require SMTP_HOST and MAIL_FROM; requests will remain queued');
  void runWishlistNotifications();
  const timer = setInterval(() => { void runWishlistNotifications(); }, 30000);
  timer.unref();
  return () => clearInterval(timer);
}
