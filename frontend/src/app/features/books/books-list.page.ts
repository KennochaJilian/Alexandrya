import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideBookOpen,
  LucideChevronLeft,
  LucideChevronRight,
  LucideCircleUser,
  LucideHeart,
  LucideLogOut,
  LucideSearch,
  LucideShield,
  LucideSlidersHorizontal,
  LucideTag
} from '@lucide/angular';
import { catchError, debounceTime, finalize, of, startWith, Subject, switchMap } from 'rxjs';
import { readApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { BooksService } from '../../core/books.service';
import { resolveCoverUrl } from '../../core/cover-url';
import type { Book, BookFilters, BookListResponse } from '../../core/models';
import { LeafSpinnerComponent } from '../../shared/leaf-spinner.component';

@Component({
  selector: 'app-books-list-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    LucideBookOpen,
    LucideChevronLeft,
    LucideChevronRight,
    LucideCircleUser,
    LucideHeart,
    LucideLogOut,
    LucideSearch,
    LucideShield,
    LucideSlidersHorizontal,
    LucideTag,
    LeafSpinnerComponent
  ],
  templateUrl: './books-list.page.html',
  styleUrl: './books-list.page.scss'
})
export class BooksListPage {
  private readonly booksService = inject(BooksService);
  private readonly auth = inject(AuthService);
  private readonly searchRequests = new Subject<{ filters: BookFilters; page: number }>();

  readonly currentUser = this.auth.currentUser;
  readonly isAdmin = this.auth.isAdmin;
  readonly books = signal<Book[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(20);
  readonly totalPages = signal(0);
  readonly isLoading = signal(true);
  readonly error = signal<string | null>(null);
  readonly advancedOpen = signal(false);
  readonly activeFilters = signal<BookFilters>({});
  readonly hasActiveFilters = computed(() => Object.keys(this.activeFilters()).length > 0);
  readonly sectionTitle = computed(() => this.hasActiveFilters() ? 'Résultats' : 'Derniers ajoutés');
  readonly canGoPrevious = computed(() => this.page() > 1 && !this.isLoading());
  readonly canGoNext = computed(() => this.page() < this.totalPages() && !this.isLoading());
  readonly pageStart = computed(() => this.total() ? ((this.page() - 1) * this.pageSize()) + 1 : 0);
  readonly pageEnd = computed(() => Math.min(this.total(), this.page() * this.pageSize()));

  readonly filters = new FormGroup({
    q: new FormControl('', { nonNullable: true }),
    title: new FormControl('', { nonNullable: true }),
    author: new FormControl('', { nonNullable: true }),
    genre: new FormControl('', { nonNullable: true }),
    publishedFrom: new FormControl('', { nonNullable: true }),
    publishedTo: new FormControl('', { nonNullable: true })
  });

  constructor() {
    this.searchRequests.pipe(
      switchMap(({ filters, page }) => {
        this.isLoading.set(true);
        this.error.set(null);

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
      this.activeFilters.set(cleanFilters);
      this.page.set(1);
      this.searchRequests.next({ filters: cleanFilters, page: 1 });
    });
  }

  logout() {
    this.auth.logout();
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
      publishedTo: ''
    });
  }

  goToPreviousPage() {
    this.goToPage(this.page() - 1);
  }

  goToNextPage() {
    this.goToPage(this.page() + 1);
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

    return parts.join(' • ');
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
      page: nextPage
    });
  }

  private cleanFilters(filters: Partial<Record<keyof BookFilters, string>>): BookFilters {
    return Object.fromEntries(
      Object.entries(filters)
        .map(([key, value]) => [key, value?.trim()])
        .filter((entry): entry is [keyof BookFilters, string] => Boolean(entry[1]))
    ) as BookFilters;
  }
}
