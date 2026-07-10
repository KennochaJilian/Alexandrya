import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideCalendar,
  LucideCircleUser,
  LucideFileText,
  LucideLogOut,
  LucideSend,
  LucideTag
} from '@lucide/angular';
import { readApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { BooksService } from '../../core/books.service';
import { resolveCoverUrl } from '../../core/cover-url';
import type { Book } from '../../core/models';

@Component({
  selector: 'app-book-detail-page',
  imports: [
    CommonModule,
    RouterLink,
    LucideArrowLeft,
    LucideCalendar,
    LucideCircleUser,
    LucideFileText,
    LucideLogOut,
    LucideSend,
    LucideTag
  ],
  templateUrl: './book-detail.page.html',
  styleUrl: './book-detail.page.scss'
})
export class BookDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly booksService = inject(BooksService);
  private readonly auth = inject(AuthService);
  private readonly bookId = this.route.snapshot.paramMap.get('id') ?? '';

  readonly currentUser = this.auth.currentUser;
  readonly book = signal<Book | null>(null);
  readonly isLoading = signal(true);
  readonly isSending = signal(false);
  readonly error = signal<string | null>(null);
  readonly sentMessage = signal<string | null>(null);

  constructor() {
    this.booksService.getBook(this.bookId).subscribe({
      next: ({ book }) => {
        this.book.set(book);
        this.isLoading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(readApiError(error));
        this.isLoading.set(false);
      }
    });
  }

  sendToKindle() {
    const book = this.book();

    if (!book) {
      return;
    }

    this.isSending.set(true);
    this.error.set(null);
    this.sentMessage.set(null);

    this.booksService.sendToKindle(book.id).subscribe({
      next: (result) => {
        this.sentMessage.set(`Envoi accepte vers ${result.to}.`);
        this.isSending.set(false);
      },
      error: (error: unknown) => {
        this.error.set(readApiError(error));
        this.isSending.set(false);
      }
    });
  }

  logout() {
    this.auth.logout();
  }

  bookInitial(book: Book): string {
    return book.title.trim().slice(0, 1).toUpperCase() || 'A';
  }

  primaryGenre(book: Book): string | null {
    return book.genres[0] ?? null;
  }

  coverSrc(book: Book): string | undefined {
    return resolveCoverUrl(book.coverUrl);
  }

  formatAuthors(book: Book): string {
    return book.authors.length ? book.authors.join(', ') : 'Auteur inconnu';
  }

  formatGenres(book: Book): string {
    return book.genres.length ? book.genres.join(', ') : 'Non renseigné';
  }

  formatDate(book: Book): string {
    return book.publishedDate?.slice(0, 10) ?? 'Non renseignée';
  }

  formatSize(book: Book): string {
    const megaBytes = book.sizeBytes / 1024 / 1024;
    return `${megaBytes.toFixed(1)} Mo`;
  }
}
