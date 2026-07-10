import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideCircleUser,
  LucideHeart,
  LucideKeyRound,
  LucideLogOut,
  LucideSave,
  LucideSend,
  LucideShield
} from '@lucide/angular';
import { readApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { FavoritesService } from '../../core/favorites.service';
import { resolveCoverUrl } from '../../core/cover-url';
import type { Book, UpdateProfileRequest } from '../../core/models';
import { LeafSpinnerComponent } from '../../shared/leaf-spinner.component';

@Component({
  selector: 'app-profile-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    LucideArrowLeft,
    LucideCircleUser,
    LucideHeart,
    LucideKeyRound,
    LucideLogOut,
    LucideSave,
    LucideSend,
    LucideShield,
    LeafSpinnerComponent
  ],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.scss'
})
export class ProfilePage {
  private readonly auth = inject(AuthService);
  private readonly favoritesService = inject(FavoritesService);

  readonly currentUser = this.auth.currentUser;
  readonly isAdmin = this.auth.isAdmin;
  readonly favorites = this.favoritesService.favorites;
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  readonly form = new FormGroup({
    name: new FormControl(this.currentUser()?.name ?? '', { nonNullable: true }),
    kindleEmail: new FormControl(this.currentUser()?.kindleEmail ?? '', {
      nonNullable: true,
      validators: [Validators.email]
    }),
    currentPassword: new FormControl('', { nonNullable: true }),
    newPassword: new FormControl('', { nonNullable: true, validators: [Validators.minLength(8)] }),
    confirmPassword: new FormControl('', { nonNullable: true })
  });

  submit() {
    this.error.set(null);
    this.success.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, kindleEmail, currentPassword, newPassword, confirmPassword } = this.form.getRawValue();

    if (newPassword && newPassword !== confirmPassword) {
      this.error.set('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }

    if (newPassword && !currentPassword) {
      this.error.set('Le mot de passe actuel est requis.');
      return;
    }

    const payload: UpdateProfileRequest = {
      name: name.trim() || null,
      kindleEmail: kindleEmail.trim() || null
    };

    if (newPassword) {
      payload.currentPassword = currentPassword;
      payload.newPassword = newPassword;
    }

    this.isSubmitting.set(true);

    this.auth.updateProfile(payload).subscribe({
      next: () => {
        this.form.patchValue({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
        this.success.set('Profil mis a jour.');
        this.isSubmitting.set(false);
      },
      error: (error: unknown) => {
        this.error.set(readApiError(error));
        this.isSubmitting.set(false);
      }
    });
  }

  logout() {
    this.auth.logout();
  }

  removeFavorite(bookId: string) {
    this.favoritesService.remove(bookId);
  }

  coverSrc(book: Book): string | undefined {
    return resolveCoverUrl(book.coverUrl);
  }

  bookInitial(book: Book): string {
    return book.title.trim().slice(0, 1).toUpperCase() || 'A';
  }

  formatAuthors(book: Book): string {
    return book.authors.length ? book.authors.join(', ') : 'Auteur inconnu';
  }
}
