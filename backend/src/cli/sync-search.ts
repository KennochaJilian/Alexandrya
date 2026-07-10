import { connectDatabase, disconnectDatabase } from '../db/mongoose.js';
import { syncSearchIndex } from '../services/library.service.js';

await connectDatabase();
const result = await syncSearchIndex();
await disconnectDatabase();

console.log(result.indexed
  ? `${result.total} livre(s) synchronise(s) dans Typesense.`
  : `${result.total} livre(s) en base. Typesense est desactive ou indisponible.`);
