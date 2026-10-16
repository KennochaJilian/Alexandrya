import { ReadingProgressModel } from './models/reading-progress.model.js';
import { ActivityModel } from './models/activity.model.js';
import { AuthorModel } from './models/author.model.js';
import { BookModel } from './models/book.model.js';
import { GenreModel } from './models/genre.model.js';
import { UserModel } from './models/user.model.js';

let indexesSynced = false;

export async function syncDatabaseIndexes() {
  if (indexesSynced) {
    return;
  }

  await Promise.all([
    ReadingProgressModel.syncIndexes(),
    ActivityModel.syncIndexes(),
    AuthorModel.syncIndexes(),
    BookModel.syncIndexes(),
    GenreModel.syncIndexes(),
    UserModel.syncIndexes()
  ]);
  indexesSynced = true;
}
