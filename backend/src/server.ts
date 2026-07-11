import { config } from './config.js';
import { createApp } from './app.js';
import { connectDatabase } from './db/mongoose.js';
import { logger, serializeError } from './utils/logger.js';

process.on('unhandledRejection', (error) => {
  logger.error('unhandled rejection', { error: serializeError(error) });
});

process.on('uncaughtException', (error) => {
  logger.error('uncaught exception', { error: serializeError(error) });
  process.exit(1);
});

await connectDatabase();
const app = createApp();

app.listen(config.port, () => {
  logger.info('Alexandrya API listening', { port: config.port });
});
