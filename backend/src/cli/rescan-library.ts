import { connectDatabase, disconnectDatabase } from '../db/mongoose.js';
import { refreshLibrary } from '../services/library.service.js';

await connectDatabase();
const books = await refreshLibrary();
await disconnectDatabase();

console.log(`${books.length} livre(s) en base.`);
