import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ReadingProgressModel } from '../db/models/reading-progress.model.js';
import { BookModel } from '../db/models/book.model.js';
import { getReadingProgress, saveReadingProgress, listCurrentReadings, readingProgressSchema } from './reading-progress.service.js';

test('positions validate the format, page bounds, CFI and completion flag', () => {
  assert.equal(readingProgressSchema.parse({ format: 'pdf', page: 4, totalPages: 8, scroll: .5, label: 'Page 4' }).completed, false);
  for (const input of [
    { format: 'pdf', page: 0, totalPages: 8, label: 'Page' },
    { format: 'pdf', page: 9, totalPages: 8, label: 'Page' },
    { format: 'pdf', page: 1, totalPages: 8, scroll: 2, label: 'Page' },
    { format: 'epub', cfi: 'https://invalid.test', label: 'Chapitre' },
    { format: 'mobi', page: 1, label: 'Page' }
  ]) assert.equal(readingProgressSchema.safeParse(input).success, false);
  assert.equal(readingProgressSchema.parse({ format: 'epub', cfi: 'epubcfi(/6/2!/4/2:0)', label: 'Chapitre', completed: true }).completed, true);
});

test('read and upsert scope progress to the signed-in user, ignoring a supplied userId', async () => {
  const find = ReadingProgressModel.findOne;
  const update = ReadingProgressModel.updateOne;
  const bookFind = BookModel.findOne;
  let readFilter: unknown;
  let writeFilter: unknown;
  let writeValue: unknown;
  let format = 'pdf';
  ReadingProgressModel.findOne = ((filter: unknown) => {
    readFilter = filter;
    return { lean: async () => ({ format: 'pdf', page: 3, totalPages: 10, scroll: .2, label: 'Page 3', completed: false, updatedAt: new Date(), userId: 'private' }) };
  }) as unknown as typeof find;
  ReadingProgressModel.updateOne = (async (filter: unknown, value: unknown) => { writeFilter = filter; writeValue = value; }) as unknown as typeof update;
  BookModel.findOne = (() => ({ lean: async () => ({ publicId: 'book', format }) })) as unknown as typeof bookFind;
  try {
    const progress = await getReadingProgress('alice', 'book');
    assert.deepEqual(readFilter, { userId: 'alice', bookId: 'book' });
    assert.equal(progress?.page, 3);
    assert.equal('userId' in progress!, false);
    await saveReadingProgress('alice', 'book', { userId: 'bob', format: 'pdf', page: 4, totalPages: 10, scroll: .3, label: 'Page 4', completed: true });
    assert.deepEqual(writeFilter, { userId: 'alice', bookId: 'book' });
    assert.deepEqual(writeValue, { $set: { format: 'pdf', page: 4, totalPages: 10, scroll: .3, label: 'Page 4', completed: true } });
    format = 'epub';
    await assert.rejects(saveReadingProgress('alice', 'book', { format: 'pdf', page: 1, totalPages: 10, label: 'Page' }), /format/);
  } finally { ReadingProgressModel.findOne = find; ReadingProgressModel.updateOne = update; BookModel.findOne = bookFind; }
});

test('home shelf excludes completed and deleted books and never projects private book paths', async () => {
  const aggregate = ReadingProgressModel.aggregate;
  let pipeline: unknown[] = [];
  ReadingProgressModel.aggregate = ((value: unknown[]) => { pipeline = value; return Promise.resolve([]); }) as unknown as typeof aggregate;
  try {
    assert.deepEqual(await listCurrentReadings('alice'), { readings: [] });
    assert.deepEqual(pipeline[0], { $match: { userId: 'alice', completed: false } });
    assert.ok(pipeline.some(stage => JSON.stringify(stage) === JSON.stringify({ $unwind: '$book' })));
    assert.ok(!JSON.stringify(pipeline.at(-1)).includes('filePath'));
  } finally { ReadingProgressModel.aggregate = aggregate; }
});
