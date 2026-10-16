import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { booksRouter } from './books.routes.js';
import { createApp } from '../app.js';
import { BookModel } from '../db/models/book.model.js';
import { ActivityModel } from '../db/models/activity.model.js';
import { errorHandler } from '../middleware/error.middleware.js';

test('reader requires authentication and serves supported books without creating download activity', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'alexandrya-reader-'));
  const filePath = path.join(directory, 'sample.pdf');
  await writeFile(filePath, '%PDF-1.4\nsample');
  let format = 'pdf';
  let file = filePath;
  let activityCount = 0;
  const originalFind = BookModel.findOne;
  const originalCreate = ActivityModel.create;
  BookModel.findOne = (() => ({ lean: async () => ({
    publicId: 'sample', title: 'Sample', authorNames: [], genreNames: [],
    format, fileName: 'sample.pdf', filePath: file, relativePath: 'sample.pdf', sizeBytes: 15
  }) })) as unknown as typeof BookModel.findOne;
  ActivityModel.create = (async () => { activityCount++; }) as unknown as typeof ActivityModel.create;
  const app = express();
  app.use('/books', booksRouter);
  app.use('/protected', createApp());
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const denied = await fetch(`${base}/protected/api/books/sample/read`);
    assert.equal(denied.status, 401);
    const pdf = await fetch(`${base}/books/sample/read`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.equal(pdf.headers.get('cache-control'), 'private, no-store');
    assert.match(await pdf.text(), /^%PDF/);
    format = 'epub';
    const epub = await fetch(`${base}/books/sample/read`);
    assert.equal(epub.headers.get('content-type'), 'application/epub+zip');
    await epub.arrayBuffer();
    format = 'mobi';
    const unsupported = await fetch(`${base}/books/sample/read`);
    assert.equal(unsupported.status, 415);
    format = 'pdf'; file = path.join(directory, 'missing.pdf');
    const missing = await fetch(`${base}/books/sample/read`);
    assert.equal(missing.status, 404);
    assert.equal(activityCount, 0);
  } finally {
    BookModel.findOne = originalFind;
    ActivityModel.create = originalCreate;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
