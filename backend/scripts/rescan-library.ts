import { connectDatabase, disconnectDatabase } from '../src/db/mongoose.js';
import { refreshLibrary } from '../src/services/library.service.js';

await connectDatabase();
const books = await refreshLibrary();
await disconnectDatabase();

console.log(`${books.length} livre(s) en base.`);
