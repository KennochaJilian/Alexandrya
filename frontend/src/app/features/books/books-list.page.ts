import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, type WritableSignal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideChevronLeft,
  LucideChevronRight,
  LucideCircleUser,
  LucideDownload,
  LucideHeart,
  LucideMenu,
  LucideSearch,
  LucideSend,
  LucideShield,
  LucideSlidersHorizontal,
  LucideTrash2
} from '@lucide/angular';
import { catchError, debounceTime, finalize, of, startWith, Subject, switchMap } from 'rxjs';
import { AdminService } from '../../core/admin.service';
import { readApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { BooksService } from '../../core/books.service';
import { resolveCoverUrl } from '../../core/cover-url';
import { FavoritesService } from '../../core/favorites.service';
import { saveBlobResponse } from '../../core/file-download';
import type { Book, BookFilters, BookListResponse } from '../../core/models';
import { LeafSpinnerComponent } from '../../shared/leaf-spinner.component';

interface BooksSearchRequest {
  filters: BookFilters;
  page: number;
  favoritesOnly: boolean;
}

interface BooksSearchFormValue {
  q: string;
  title: string;
  author: string;
  genre: string;
  publishedFrom: string;
  publishedTo: string;
  favoritesOnly: boolean;
}

@Component({
  selector: 'app-books-list-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    LucideChevronLeft,
    LucideChevronRight,
    LucideCircleUser,
    LucideDownload,
    LucideHeart,
    LucideMenu,
    LucideSearch,
    LucideSend,
    LucideShield,
    LucideSlidersHorizontal,
    LucideTrash2,
    LeafSpinnerComponent
  ],
  templateUrl: './books-list.page.html',
  styleUrl: './books-list.page.scss'
})
export class BooksListPage {
  private readonly booksService = inject(BooksService);
  private readonly adminService = inject(AdminService);
  private readonly auth = inject(AuthService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly searchRequests = new Subject<BooksSearchRequest>();

  readonly currentUser = this.auth.currentUser;
  readonly isAdmin = this.auth.isAdmin;
  readonly favoriteIds = this.favoritesService.favoriteIds;
  readonly books = signal<Book[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(5);
  readonly totalPages = signal(0);
  readonly downloadingBookIds = signal<Set<string>>(new Set());
  readonly sendingBookIds = signal<Set<string>>(new Set());
  readonly deletingBookIds = signal<Set<string>>(new Set());
  readonly isLoading = signal(true);
  readonly error = signal<string | null>(null);
  readonly actionMessage = signal<string | null>(null);
  readonly advancedOpen = signal(false);
  readonly menuOpen = signal(false);
  readonly favoritesOnly = signal(false);
  readonly activeFilters = signal<BookFilters>({});
  readonly hasActiveFilters = computed(() => Object.keys(this.activeFilters()).length > 0 || this.favoritesOnly());
  readonly sectionTitle = computed(() => this.favoritesOnly() ? 'Mes favoris' : this.hasActiveFilters() ? 'Résultats' : 'Derniers ajoutés');
  readonly canGoPrevious = computed(() => this.page() > 1 && !this.isLoading());
  readonly canGoNext = computed(() => this.page() < this.totalPages() && !this.isLoading());
  readonly pageStart = computed(() => this.total() ? ((this.page() - 1) * this.pageSize()) + 1 : 0);
  readonly pageEnd = computed(() => Math.min(this.total(), this.page() * this.pageSize()));
  readonly visiblePages = computed(() => {
    const totalPages = this.totalPages();

    if (!totalPages) {
      return [];
    }

    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const halfWindow = Math.floor(maxVisiblePages / 2);
    let start = Math.max(1, this.page() - halfWindow);
    let end = Math.min(totalPages, start + maxVisiblePages - 1);

    start = Math.max(1, end - maxVisiblePages + 1);
    end = Math.min(totalPages, start + maxVisiblePages - 1);

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });

  readonly filters = new FormGroup({
    q: new FormControl('', { nonNullable: true }),
    title: new FormControl('', { nonNullable: true }),
    author: new FormControl('', { nonNullable: true }),
    genre: new FormControl('', { nonNullable: true }),
    publishedFrom: new FormControl('', { nonNullable: true }),
    publishedTo: new FormControl('', { nonNullable: true }),
    favoritesOnly: new FormControl(false, { nonNullable: true })
  });

  constructor() {
    this.searchRequests.pipe(
      switchMap(({ filters, page, favoritesOnly }) => {
        this.isLoading.set(true);
        this.error.set(null);

        if (favoritesOnly) {
          return of(this.searchFavoriteBooks(filters, page)).pipe(
            finalize(() => this.isLoading.set(false))
          );
        }

        return this.booksService.searchBooks({
          ...filters,
          page,
          pageSize: this.pageSize()
        }).pipe(
          catchError((error: unknown) => {
            this.error.set(readApiError(error));
            return of({
              books: [],
              total: 0,
              page,
              pageSize: this.pageSize(),
              totalPages: 0
            } satisfies BookListResponse);
          }),
          finalize(() => this.isLoading.set(false))
        );
      }),
      takeUntilDestroyed()
    ).subscribe((result) => {
      this.books.set(result.books);
      this.total.set(result.total);
      this.page.set(result.page);
      this.pageSize.set(result.pageSize);
      this.totalPages.set(result.totalPages);
    });

    this.filters.valueChanges.pipe(
      startWith(this.filters.getRawValue()),
      debounceTime(220),
      takeUntilDestroyed()
    ).subscribe((filters) => {
      const cleanFilters = this.cleanFilters(filters);
      const favoritesOnly = Boolean(filters.favoritesOnly);

      this.activeFilters.set(cleanFilters);
      this.favoritesOnly.set(favoritesOnly);
      this.page.set(1);
      this.searchRequests.next({ filters: cleanFilters, page: 1, favoritesOnly });
    });
  }

  logout() {
    this.auth.logout();
  }

  toggleMenu() {
    this.menuOpen.update((isOpen) => !isOpen);
  }

  closeMenu() {
    this.menuOpen.set(false);
  }

  toggleAdvancedFilters() {
    this.advancedOpen.update((isOpen) => !isOpen);
  }

  resetFilters() {
    this.filters.reset({
      q: '',
      title: '',
      author: '',
      genre: '',
      publishedFrom: '',
      publishedTo: '',
      favoritesOnly: false
    });
  }

  toggleFavoritesOnly() {
    this.filters.controls.favoritesOnly.setValue(!this.filters.controls.favoritesOnly.value);
  }

  toggleFavorite(book: Book) {
    this.favoritesService.toggle(book);

    if (this.favoritesOnly()) {
      this.searchRequests.next({
        filters: this.activeFilters(),
        page: this.page(),
        favoritesOnly: true
      });
    }
  }

  downloadBook(book: Book) {
    if (this.downloadingBookIds().has(book.id)) {
      return;
    }

    this.setBookActionState(this.downloadingBookIds, book.id, true);
    this.error.set(null);
    this.actionMessage.set(null);

    this.booksService.downloadBook(book.id).pipe(
      finalize(() => this.setBookActionState(this.downloadingBookIds, book.id, false))
    ).subscribe({
      next: (response) => {
        saveBlobResponse(response, book.fileName);
        this.actionMessage.set('Telechargement lance.');
      },
      error: (error: unknown) => {
        this.error.set(readApiError(error));
      }
    });
  }

  sendToKindle(book: Book) {
    if (!this.currentUser()?.kindleEmail || this.sendingBookIds().has(book.id)) {
      return;
    }

    this.setBookActionState(this.sendingBookIds, book.id, true);
    this.error.set(null);
    this.actionMessage.set(null);

    this.booksService.sendToKindle(book.id).pipe(
      finalize(() => this.setBookActionState(this.sendingBookIds, book.id, false))
    ).subscribe({
      next: (result) => {
        this.actionMessage.set(`Envoi accepte vers ${result.to}.`);
      },
      error: (error: unknown) => {
        this.error.set(readApiError(error));
      }
    });
  }

  deleteBook(book: Book) {
    if (!this.isAdmin() || this.deletingBookIds().has(book.id)) {
      return;
    }

    const confirmed = window.confirm(`Supprimer definitivement "${book.title}" ? Le fichier ebook sera aussi supprime du serveur.`);

    if (!confirmed) {
      return;
    }

    this.setBookActionState(this.deletingBookIds, book.id, true);
    this.error.set(null);
    this.actionMessage.set(null);

    this.adminService.deleteBook(book.id).pipe(
      finalize(() => this.setBookActionState(this.deletingBookIds, book.id, false))
    ).subscribe({
      next: () => {
        this.favoritesService.remove(book.id);
        this.actionMessage.set(`Livre "${book.title}" supprime.`);
        this.refreshAfterDeletion();
      },
      error: (error: unknown) => {
        this.error.set(readApiError(error));
      }
    });
  }

  goToPreviousPage() {
    this.goToPage(this.page() - 1);
  }

  goToNextPage() {
    this.goToPage(this.page() + 1);
  }

  goToPageNumber(page: number) {
    this.goToPage(page);
  }

  formatAuthors(book: Book): string {
    return book.authors.length ? book.authors.join(', ') : 'Auteur inconnu';
  }

  formatMeta(book: Book): string {
    const parts = [
      book.publishedDate?.slice(0, 4),
      book.language?.toUpperCase(),
      book.format.toUpperCase()
    ].filter(Boolean);

    return parts.join(' | ');
  }

  primaryGenre(book: Book): string | null {
    return book.genres[0] ?? null;
  }

  bookInitial(book: Book): string {
    return book.title.trim().slice(0, 1).toUpperCase() || 'A';
  }

  coverSrc(book: Book): string | undefined {
    return resolveCoverUrl(book.coverUrl);
  }

  private goToPage(page: number) {
    const totalPages = Math.max(1, this.totalPages());
    const nextPage = Math.min(totalPages, Math.max(1, page));

    if (nextPage === this.page()) {
      return;
    }

    this.page.set(nextPage);
    this.searchRequests.next({
      filters: this.activeFilters(),
      page: nextPage,
      favoritesOnly: this.favoritesOnly()
    });
  }

  private refreshAfterDeletion() {
    const nextTotal = Math.max(0, this.total() - 1);
    const nextTotalPages = Math.max(1, Math.ceil(nextTotal / this.pageSize()));
    const nextPage = Math.min(this.page(), nextTotalPages);

    this.page.set(nextPage);
    this.searchRequests.next({
      filters: this.activeFilters(),
      page: nextPage,
      favoritesOnly: this.favoritesOnly()
    });
  }

  private searchFavoriteBooks(filters: BookFilters, page: number): BookListResponse {
    const filteredFavorites = this.favoritesService.favorites()
      .filter((book) => this.matchesFilters(book, filters));
    const pageSize = this.pageSize();
    const total = filteredFavorites.length;
    const totalPages = Math.ceil(total / pageSize);
    const safePage = totalPages ? Math.min(Math.max(1, page), totalPages) : 1;
    const start = (safePage - 1) * pageSize;

    return {
      books: filteredFavorites.slice(start, start + pageSize),
      total,
      page: safePage,
      pageSize,
      totalPages
    };
  }

  private matchesFilters(book: Book, filters: BookFilters): boolean {
    const query = filters.q?.trim();
    const searchableText = [
      book.title,
      book.authors.join(' '),
      book.genres.join(' '),
      book.publishedDate,
      book.fileName
    ].join(' ');

    return this.includesFilter(searchableText, query)
      && this.includesFilter(book.title, filters.title)
      && this.arrayIncludesFilter(book.authors, filters.author)
      && this.arrayIncludesFilter(book.genres, filters.genre)
      && this.matchesDateRange(book, filters);
  }

  private arrayIncludesFilter(values: string[], filter: string | undefined): boolean {
    if (!filter?.trim()) {
      return true;
    }

    return values.some((value) => this.includesFilter(value, filter));
  }

  private includesFilter(value: string | undefined, filter: string | undefined): boolean {
    if (!filter?.trim()) {
      return true;
    }

    return this.normalize(value ?? '').includes(this.normalize(filter));
  }

  private matchesDateRange(book: Book, filters: BookFilters): boolean {
    if (!filters.publishedFrom && !filters.publishedTo) {
      return true;
    }

    if (!book.publishedDate) {
      return false;
    }

    if (filters.publishedFrom && book.publishedDate < filters.publishedFrom) {
      return false;
    }

    return !(filters.publishedTo && book.publishedDate > filters.publishedTo);
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
  }

  private setBookActionState(actionIds: WritableSignal<Set<string>>, bookId: string, isActive: boolean) {
    actionIds.update((currentIds) => {
      const nextIds = new Set(currentIds);

      if (isActive) {
        nextIds.add(bookId);
      } else {
        nextIds.delete(bookId);
      }

      return nextIds;
    });
  }

  private cleanFilters(filters: Partial<BooksSearchFormValue>): BookFilters {
    const { favoritesOnly: _favoritesOnly, ...searchFilters } = filters;

    return Object.fromEntries(
      Object.entries(searchFilters)
        .map(([key, value]) => [key, value?.trim()])
        .filter((entry): entry is [keyof BookFilters, string] => Boolean(entry[1]))
    ) as BookFilters;
  }
}
