import { TestBed } from '@angular/core/testing';
import { FavoritesService } from './favorites.service';
import type { Book } from './models';

const storageKey = 'alexandrya.favorites';

function createBook(id: string, title: string): Book {
  return {
    id,
    title,
    authors: ['Danielle Steel'],
    genres: ['Romance'],
    format: 'epub',
    fileName: `${title}.epub`,
    relativePath: `${title}.epub`,
    sizeBytes: 1200
  };
}

describe('FavoritesService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('stores and removes favorite books from localStorage', () => {
    const service = TestBed.inject(FavoritesService);
    const book = createBook('book-1', 'Prisonniere');

    service.toggle(book);

    expect(service.favoriteIds().has(book.id)).toBe(true);
    expect(JSON.parse(localStorage.getItem(storageKey) ?? '[]')).toEqual([book]);

    service.toggle(book);

    expect(service.favoriteIds().has(book.id)).toBe(false);
    expect(JSON.parse(localStorage.getItem(storageKey) ?? '[]')).toEqual([]);
  });

  it('deduplicates stored books on startup', () => {
    const book = createBook('book-1', 'Prisonniere');
    localStorage.setItem(storageKey, JSON.stringify([book, book]));

    const service = TestBed.inject(FavoritesService);

    expect(service.favorites()).toEqual([book]);
  });
});
