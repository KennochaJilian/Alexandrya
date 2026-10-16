import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WishlistModel } from '../db/models/wishlist.model.js';
import { createWishlistRequest, listWishlist, updateWishlistStatus, wishlistInputSchema } from './wishlist.service.js';

const user = { id: 'alice', email: 'alice@example.test', role: 'user' as const };
test('request validation rejects blank titles and excessive notes', () => {
  assert.equal(wishlistInputSchema.safeParse({ title: '  ' }).success, false);
  assert.equal(wishlistInputSchema.safeParse({ title: 'Dune', notes: 'x'.repeat(1001) }).success, false);
});

test('request identity comes from the signed-in user and duplicates are reported clearly', async () => {
  const original = WishlistModel.create;
  let saved: Record<string, unknown> = {};
  WishlistModel.create = (async (value: Record<string, unknown>) => { saved = value; return { _id: 'new' }; }) as unknown as typeof original;
  try {
    assert.deepEqual(await createWishlistRequest(user, { title: ' Dune ', author: ' Frank  HÉRBERT ', userId: 'bob' }), { id: 'new' });
    assert.equal(saved['userId'], 'alice');
    assert.equal(saved['title'], 'Dune');
    assert.equal(saved['key'], '["dune","frank herbert"]');
    assert.ok(saved['notifyAfter'] instanceof Date);
    WishlistModel.create = (async () => { throw { code: 11000 }; }) as unknown as typeof original;
    await assert.rejects(createWishlistRequest(user, { title: 'Dune' }), (error: unknown) => (error as { status: number }).status === 409);
  } finally { WishlistModel.create = original; }
});

test('personal list scopes to the caller and excludes other users and notification metadata', async () => {
  const find = WishlistModel.find;
  const count = WishlistModel.countDocuments;
  let filter: unknown;
  const query = { sort() { return this; }, skip() { return this; }, limit() { return this; }, async lean() { return [{ _id: 'one', title: 'Dune', author: '', notes: '', status: 'pending', userEmail: 'alice@example.test', notifiedAt: null }]; } };
  WishlistModel.find = ((value: unknown) => { filter = value; return query; }) as unknown as typeof find;
  WishlistModel.countDocuments = (async () => 1) as unknown as typeof count;
  try {
    const result = await listWishlist({ userId: 'bob' }, 'alice');
    assert.deepEqual(filter, { userId: 'alice' });
    assert.equal('userEmail' in result.requests[0]!, false);
    assert.equal('notifiedAt' in result.requests[0]!, false);
    const global = await listWishlist({});
    assert.deepEqual(filter, {});
    assert.equal(global.requests[0]?.userEmail, 'alice@example.test');
  } finally { WishlistModel.find = find; WishlistModel.countDocuments = count; }
});

test('admin status changes reject invalid identifiers and missing requests', async () => {
  await assert.rejects(updateWishlistStatus('invalid', 'fulfilled'), /introuvable/);
  const update = WishlistModel.updateOne;
  WishlistModel.updateOne = (async () => ({ matchedCount: 0 })) as unknown as typeof update;
  try { await assert.rejects(updateWishlistStatus('123456789012345678901234', 'fulfilled'), /introuvable/); }
  finally { WishlistModel.updateOne = update; }
});
