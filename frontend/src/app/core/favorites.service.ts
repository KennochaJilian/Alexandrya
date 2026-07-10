import { computed, Injectable, signal } from '@angular/core';
import type { Book } from './models';

const favoritesStorageKey = 'alexandrya.favorites';

function readStoredFavorites(): Book[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }

  const raw = localStorage.getItem(favoritesStorageKey);

  if (!raw) {
    return [];
  }

  try {
    const favorites = JSON.parse(raw) as Book[];
    const uniqueFavorites = new Map(favorites.filter((book) => book.id).map((book) => [book.id, book]));
    return [...uniqueFavorites.values()];
  } catch {
    localStorage.removeItem(favoritesStorageKey);
    return [];
  }
}

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly favoriteBooks = signal<Book[]>(readStoredFavorites());

  readonly favorites = computed(() => this.favoriteBooks());
  readonly favoriteIds = computed(() => new Set(this.favoriteBooks().map((book) => book.id)));

  toggle(book: Book) {
    if (this.favoriteIds().has(book.id)) {
      this.remove(book.id);
      return;
    }

    this.favoriteBooks.update((books) => [book, ...books.filter((favorite) => favorite.id !== book.id)]);
    this.persist();
  }

  remove(bookId: string) {
    this.favoriteBooks.update((books) => books.filter((book) => book.id !== bookId));
    this.persist();
  }

  private persist() {
    localStorage.setItem(favoritesStorageKey, JSON.stringify(this.favoriteBooks()));
  }
}
