import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { createApp } from '../app.js';
import { UserModel } from '../db/models/user.model.js';
import { WishlistModel } from '../db/models/wishlist.model.js';

test('wishlist HTTP routes enforce login, personal scope and admin-only global access/status updates', async () => {
  const findUser = UserModel.findById;
  const find = WishlistModel.find;
  const count = WishlistModel.countDocuments;
  const update = WishlistModel.updateOne;
  let filter: unknown;
  let changed: unknown;
  UserModel.findById = ((id: string) => ({ lean: async () => ({ _id: id, email: `${id}@example.test`, role: id === 'admin' ? 'admin' : 'user' }) })) as unknown as typeof findUser;
  const query = { sort() { return this; }, skip() { return this; }, limit() { return this; }, async lean() { return [{ _id: 'one', title: 'Dune', author: '', notes: '', status: 'pending', userEmail: 'alice@example.test' }]; } };
  WishlistModel.find = ((value: unknown) => { filter = value; return query; }) as unknown as typeof find;
  WishlistModel.countDocuments = (async () => 1) as unknown as typeof count;
  WishlistModel.updateOne = (async (_filter: unknown, value: unknown) => { changed = value; return { matchedCount: 1 }; }) as unknown as typeof update;
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const headers = (sub: string) => ({ authorization: `Bearer ${jwt.sign({}, config.jwtSecret, { subject: sub })}`, 'content-type': 'application/json' });
  try {
    assert.equal((await fetch(`${base}/wishlist`)).status, 401);
    assert.equal((await fetch(`${base}/admin/wishlist`, { headers: headers('alice') })).status, 403);
    assert.equal((await fetch(`${base}/admin/wishlist/123456789012345678901234`, { method: 'PATCH', headers: headers('alice'), body: JSON.stringify({ status: 'fulfilled' }) })).status, 403);
    const personal = await fetch(`${base}/wishlist?userId=bob`, { headers: headers('alice') });
    assert.equal(personal.status, 200);
    assert.deepEqual(filter, { userId: 'alice' });
    assert.equal('userEmail' in (await personal.json()).requests[0], false);
    const global = await fetch(`${base}/admin/wishlist`, { headers: headers('admin') });
    assert.equal(global.status, 200); assert.deepEqual(filter, {});
    assert.equal((await global.json()).requests[0].userEmail, 'alice@example.test');
    assert.equal((await fetch(`${base}/admin/wishlist/123456789012345678901234`, { method: 'PATCH', headers: headers('admin'), body: JSON.stringify({ status: 'fulfilled' }) })).status, 204);
    assert.deepEqual(changed, { $set: { status: 'fulfilled' } });
  } finally {
    UserModel.findById = findUser; WishlistModel.find = find; WishlistModel.countDocuments = count; WishlistModel.updateOne = update;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
