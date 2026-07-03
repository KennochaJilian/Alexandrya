import mongoose from 'mongoose';
import { config } from '../config.js';
import { syncDatabaseIndexes } from './sync-indexes.js';

export async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    await syncDatabaseIndexes();
    return;
  }

  await mongoose.connect(config.mongoUri, {
    dbName: config.mongoDbName
  });
  await syncDatabaseIndexes();
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
