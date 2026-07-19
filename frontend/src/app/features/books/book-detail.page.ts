import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideCircleUser,
  LucideDownload,
  LucideHeart,
  LucideMenu,
  LucideSend,
  LucideShield,
  LucideTrash2,
  LucideX
} from '@lucide/angular';
import { finalize } from 'rxjs';
import { AdminService } from '../../core/admin.service';
import { readApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { BooksService } from '../../core/books.service';
import { resolveCoverUrl } from '../../core/cover-url';
import { FavoritesService } from '../../core/favorites.service';
import { saveBlobResponse } from '../../core/file-download';
import type { Book } from '../../core/models';
import { LeafSpinnerComponent } from '../../shared/leaf-spinner.component';

@Component({
  selector: 'app-book-detail-page',
  imports: [
    CommonModule,
    RouterLink,
    LucideArrowLeft,
    LucideCircleUser,
    LucideDownload,
    LucideHeart,
    LucideMenu,
    LucideSend,
    LucideShield,
    LucideTrash2,
    LucideX,
    LeafSpinnerComponent
  ],
  templateUrl: './book-detail.page.html',
  styleUrl: './book-detail.page.scss'
})
export class BookDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly booksService = inject(BooksService);
  private readonly adminService = inject(AdminService);
  private readonly auth = inject(AuthService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly bookId = this.route.snapshot.paramMap.get('id') ?? '';

  readonly currentUser = this.auth.currentUser;
  readonly isAdmin = this.auth.isAdmin;
  readonly favoriteIds = this.favoritesService.favoriteIds;
  readonly book = signal<Book | null>(null);
  readonly isLoading = signal(true);
  readonly isDownloading = signal(false);
  readonly isSending = signal(false);
  readonly isDeleting = signal(false);
  readonly error = signal<string | null>(null);
  readonly sentMessage = signal<string | null>(null);
  readonly menuOpen = signal(false);
  readonly descriptionExpanded = signal(false);

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

  downloadBook() {
    const book = this.book();

    if (!book || this.isDownloading()) {
      return;
    }

    this.isDownloading.set(true);
    this.error.set(null);
    this.sentMessage.set(null);

    this.booksService.downloadBook(book.id).pipe(
      finalize(() => this.isDownloading.set(false))
    ).subscribe({
      next: (response) => {
        saveBlobResponse(response, book.fileName);
        this.sentMessage.set('Telechargement lance.');
      },
      error: (error: unknown) => {
        this.error.set(readApiError(error));
      }
    });
  }

  sendToKindle() {
    const book = this.book();

    if (!book || !this.currentUser()?.kindleEmail || this.isSending()) {
      return;
    }

    this.isSending.set(true);
    this.error.set(null);
    this.sentMessage.set(null);

    this.booksService.sendToKindle(book.id).pipe(
      finalize(() => this.isSending.set(false))
    ).subscribe({
      next: (result) => {
        this.sentMessage.set(`Envoi accepte vers ${result.to}.`);
      },
      error: (error: unknown) => {
        this.error.set(readApiError(error));
      }
    });
  }

  deleteBook() {
    const book = this.book();

    if (!book || !this.isAdmin() || this.isDeleting()) {
      return;
    }

    const confirmed = window.confirm(`Supprimer definitivement "${book.title}" ? Le fichier ebook sera aussi supprime du serveur.`);

    if (!confirmed) {
      return;
    }

    this.isDeleting.set(true);
    this.error.set(null);
    this.sentMessage.set(null);

    this.adminService.deleteBook(book.id).pipe(
      finalize(() => this.isDeleting.set(false))
    ).subscribe({
      next: () => {
        this.favoritesService.remove(book.id);
        void this.router.navigateByUrl('/books');
      },
      error: (error: unknown) => {
        this.error.set(readApiError(error));
      }
    });
  }

  toggleFavorite(book: Book) {
    this.favoritesService.toggle(book);
  }

  toggleCurrentBookFavorite() {
    const book = this.book();

    if (book) {
      this.toggleFavorite(book);
    }
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

  clearMessage() {
    this.sentMessage.set(null);
  }

  toggleDescription() {
    this.descriptionExpanded.update((isExpanded) => !isExpanded);
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
    return book.genres.length ? book.genres.join(', ') : 'Non renseigne';
  }

  formatDate(book: Book): string {
    return book.publishedDate?.slice(0, 10) ?? 'Non renseignee';
  }

  formatYear(book: Book): string {
    return book.publishedDate?.slice(0, 4) ?? 'Non renseigne';
  }

  formatLanguage(book: Book): string {
    return book.language?.toUpperCase() ?? 'FR';
  }

  formatSize(book: Book): string {
    const megaBytes = book.sizeBytes / 1024 / 1024;
    return `${megaBytes.toFixed(1)} Mo`;
  }

  formatAddedAt(book: Book): string {
    if (!book.addedAt) {
      return 'Non renseigne';
    }

    const addedAt = new Date(book.addedAt);

    if (Number.isNaN(addedAt.getTime())) {
      return book.addedAt;
    }

    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(addedAt);
  }

  displayDescription(book: Book): string {
    const description = book.description?.trim() ?? '';

    if (this.descriptionExpanded() || description.length <= 520) {
      return description;
    }

    return `${description.slice(0, 520).trim()}...`;
  }

  hasLongDescription(book: Book): boolean {
    return (book.description?.trim().length ?? 0) > 520;
  }
}
