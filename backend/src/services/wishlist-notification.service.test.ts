import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextWishlistDigest } from './wishlist-schedule.js';
import { processWishlistNotifications, wishlistMailText, type WishlistNotificationStore } from './wishlist-notification.service.js';
import type { WishlistBatch } from '../db/models/wishlist.model.js';

const now = new Date('2026-10-16T16:30:00Z');
function storeFixture(count: number, due = false, recipients = ['admin-a@example.test', 'admin-b@example.test']) {
  const state = { locked: false, count, batch: null as WishlistBatch | null, completed: 0 };
  const store: WishlistNotificationStore = {
    async acquire() { if (state.locked) return false; state.locked = true; return true; },
    async renew() { return state.locked; },
    async release() { state.locked = false; },
    async loadBatch() { return structuredClone(state.batch); },
    async pendingInfo() { return { count: state.count, due }; },
    async createBatch() {
      if (!recipients.length) return null;
      state.batch = { id: 'batch', recipients, deliveredTo: [], requests: Array.from({ length: state.count }, (_, i) => ({
        id: String(i), title: `Livre ${i + 1}`, author: 'Auteur', notes: 'Tome 2', userEmail: 'reader@example.test', requestedAt: now
      })) };
      return structuredClone(state.batch);
    },
    async markDelivered(email) { state.batch!.deliveredTo.push(email); },
    async completeBatch() { state.completed++; state.count = 0; state.batch = null; }
  };
  return { state, store };
}

test('daily deadline is 18:30 Paris, including winter and summer clock changes', () => {
  for (const [input, output] of [
    ['2026-10-16T16:29:59Z', '2026-10-16T16:30:00.000Z'],
    ['2026-10-16T16:30:01Z', '2026-10-17T16:30:00.000Z'],
    ['2026-12-16T17:29:59Z', '2026-12-16T17:30:00.000Z'],
    ['2026-03-28T18:00:00Z', '2026-03-29T16:30:00.000Z'],
    ['2026-10-24T18:00:00Z', '2026-10-25T17:30:00.000Z']
  ]) assert.equal(nextWishlistDigest(new Date(input!)).toISOString(), output);
});

test('four new requests wait; the fifth triggers one email per admin without a second evening email', async () => {
  const fixture = storeFixture(4);
  const sent: string[] = [];
  const send = async (email: string) => { sent.push(email); };
  await processWishlistNotifications(fixture.store, send, now);
  assert.deepEqual(sent, []);
  fixture.state.count = 5;
  await processWishlistNotifications(fixture.store, send, now);
  assert.deepEqual(sent, ['admin-a@example.test', 'admin-b@example.test']);
  assert.equal(fixture.state.completed, 1);
  await processWishlistNotifications(fixture.store, send, now);
  assert.equal(sent.length, 2);
});

test('the evening deadline sends a smaller queue, including after an API restart', async () => {
  const fixture = storeFixture(1, true);
  let sent = 0;
  await processWishlistNotifications(fixture.store, async () => { sent++; }, now);
  assert.equal(sent, 2);
  assert.equal(fixture.state.count, 0);
});

test('SMTP partial failure preserves the batch and retries only admins not already notified', async () => {
  const fixture = storeFixture(5);
  const sent: string[] = [];
  await assert.rejects(processWishlistNotifications(fixture.store, async email => {
    if (email.includes('admin-a')) throw new Error('SMTP unavailable');
    sent.push(email);
  }, now), AggregateError);
  assert.deepEqual(sent, ['admin-b@example.test']);
  assert.equal(fixture.state.count, 5);
  assert.equal(fixture.state.locked, false);
  await processWishlistNotifications(fixture.store, async email => { sent.push(email); }, now);
  assert.deepEqual(sent, ['admin-b@example.test', 'admin-a@example.test']);
  assert.equal(fixture.state.completed, 1);
});

test('concurrent workers do not send the same batch twice', async () => {
  const fixture = storeFixture(5);
  let sent = 0;
  await Promise.all([1, 2].map(() => processWishlistNotifications(fixture.store, async () => { sent++; }, now)));
  assert.equal(sent, 2);
});

test('requests remain pending if no admin exists, or when the database lease is lost', async () => {
  const noAdmins = storeFixture(5, false, []);
  await processWishlistNotifications(noAdmins.store, async () => { assert.fail('Must not send'); }, now);
  assert.equal(noAdmins.state.count, 5);
  const lost = storeFixture(5);
  lost.store.renew = async () => false;
  await assert.rejects(processWishlistNotifications(lost.store, async () => { assert.fail('Must not send'); }, now), /lease lost/);
  assert.equal(lost.state.count, 5);
});

test('digest contains title, author, requester and notes in plain text', () => {
  const batch: WishlistBatch = { id: 'batch', recipients: [], deliveredTo: [], requests: [{ id: '1', title: 'Dune', author: 'Frank Herbert', notes: 'En français', userEmail: 'reader@example.test', requestedAt: now }] };
  const text = wishlistMailText(batch);
  for (const expected of ['Dune', 'Frank Herbert', 'reader@example.test', 'En français', '18:30']) assert.ok(text.includes(expected));
});
