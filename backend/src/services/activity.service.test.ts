import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ActivityModel } from '../db/models/activity.model.js';
import { listActivity, recordActivity } from './activity.service.js';

test('personal history enforces actor filter and hides actor details', async () => {
  let filter: unknown;
  const originalFind = ActivityModel.find;
  const originalCount = ActivityModel.countDocuments;
  const chain = {
    sort() { return this; }, skip() { return this; }, limit() { return this; },
    async lean() { return [{ _id: 'event', userId: 'alice', userEmail: 'private@example.com', title: 'Livre' }]; }
  };
  ActivityModel.find = ((value: unknown) => { filter = value; return chain; }) as unknown as typeof ActivityModel.find;
  ActivityModel.countDocuments = (async () => 1) as unknown as typeof ActivityModel.countDocuments;
  try {
    const result = await listActivity({ page: '1', userId: 'bob' }, 'alice');
    assert.deepEqual(filter, { userId: 'alice' });
    assert.equal(result.activities[0]?.id, 'event');
    assert.equal('userEmail' in result.activities[0]!, false);
    const global = await listActivity({});
    assert.deepEqual(filter, {});
    assert.equal(global.activities[0]?.userEmail, 'private@example.com');
    await assert.rejects(listActivity({ page: 0 }, 'alice'));
    await assert.rejects(listActivity({ pageSize: 101 }, 'alice'));
  } finally {
    ActivityModel.find = originalFind;
    ActivityModel.countDocuments = originalCount;
  }
});

test('activity snapshots retain book details without private filesystem paths', async () => {
  const originalCreate = ActivityModel.create;
  let recorded: Record<string, unknown> | undefined;
  ActivityModel.create = (async (value: Record<string, unknown>) => { recorded = value; }) as unknown as typeof ActivityModel.create;
  try {
    await recordActivity({
      id: 'book', title: 'Titre', authors: ['Auteur'], genres: [], format: 'epub',
      fileName: 'book.epub', filePath: '/private/book.epub', relativePath: 'book.epub', sizeBytes: 12
    }, { id: 'alice', email: 'alice@example.com', role: 'user' }, 'download');
    assert.equal(recorded?.title, 'Titre');
    assert.equal(recorded?.userId, 'alice');
    assert.equal(recorded?.action, 'download');
    assert.equal('filePath' in recorded!, false);
  } finally { ActivityModel.create = originalCreate; }
});

