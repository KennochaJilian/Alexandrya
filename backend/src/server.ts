import { config } from './config.js';
import { createApp } from './app.js';
import { connectDatabase } from './db/mongoose.js';

await connectDatabase();
const app = createApp();

app.listen(config.port, () => {
  console.log(`Alexandrya API listening on http://localhost:${config.port}`);
});
