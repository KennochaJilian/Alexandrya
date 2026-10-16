import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, DestroyRef, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideBookPlus, LucideSend, LucideX } from '@lucide/angular';
import { finalize } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { readApiError } from '../core/api-error';
import { WishlistService, type WishlistRequest, type WishlistStatus } from '../core/wishlist.service';
import { LeafSpinnerComponent } from './leaf-spinner.component';

@Component({
  selector: 'app-wishlist-dialog',
  imports: [CommonModule, ReactiveFormsModule, LucideBookPlus, LucideSend, LucideX, LeafSpinnerComponent],
  templateUrl: './wishlist-dialog.component.html',
  styleUrl: './wishlist-dialog.component.scss'
})
export class WishlistDialogComponent implements AfterViewInit {
  private readonly wishlist = inject(WishlistService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly closed = output<void>();
  readonly isAdmin = this.auth.isAdmin;
  readonly requests = signal<WishlistRequest[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly totalPages = signal(0);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly updating = signal<Set<string>>(new Set());
  readonly notificationsConfigured = signal(true);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  private previousOverflow = '';
  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(250)] }),
    author: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(200)] }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] })
  });
  constructor() {
    this.destroyRef.onDestroy(() => {
      document.body.style.overflow = this.previousOverflow;
      this.dialog().nativeElement.close();
    });
  }
  ngAfterViewInit() {
    this.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.dialog().nativeElement.showModal();
    this.load(1);
  }
  load(page: number) {
    this.error.set(null);
    this.loading.set(true);
    this.wishlist.list(page, this.isAdmin()).pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))
    ).subscribe({
      next: response => {
        this.requests.set(response.requests); this.total.set(response.total);
        this.page.set(response.page); this.totalPages.set(response.totalPages);
        this.notificationsConfigured.set(response.notificationsConfigured !== false);
      },
      error: (error: unknown) => this.error.set(readApiError(error))
    });
  }
  submit() {
    if (this.submitting()) return;
    this.error.set(null); this.success.set(null);
    if (this.form.invalid || !this.form.controls.title.value.trim()) {
      this.form.markAllAsTouched();
      this.error.set('Indiquez au moins le titre du livre.'); return;
    }
    this.submitting.set(true);
    const value = this.form.getRawValue();
    this.wishlist.create({ title: value.title.trim(), author: value.author.trim(), notes: value.notes.trim() }).pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.submitting.set(false))
    ).subscribe({
      next: () => {
        this.form.reset(); this.success.set('Votre demande a bien été ajoutée à la wishlist.'); this.load(1);
      },
      error: (error: unknown) => this.error.set(readApiError(error))
    });
  }
  changeStatus(request: WishlistRequest, event: Event) {
    const status = (event.target as HTMLSelectElement).value as WishlistStatus;
    if (this.updating().has(request.id)) return;
    this.error.set(null);
    this.updating.update(ids => new Set([...ids, request.id]));
    this.wishlist.updateStatus(request.id, status).pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.updating.update(ids => { const next = new Set(ids); next.delete(request.id); return next; }))
    ).subscribe({
      next: () => this.requests.update(items => items.map(item => item.id === request.id ? { ...item, status } : item)),
      error: (error: unknown) => { (event.target as HTMLSelectElement).value = request.status; this.error.set(readApiError(error)); }
    });
  }
  statusLabel(status: WishlistStatus) { return { pending: 'À ajouter', fulfilled: 'Ajouté', rejected: 'Refusé' }[status]; }
}

@Component({
  selector: 'app-wishlist-trigger',
  imports: [LucideBookPlus, WishlistDialogComponent],
  template: `
    <button type="button" class="wishlist-trigger" (click)="open.set(true)">
      <svg lucideBookPlus aria-hidden="true" [size]="17"></svg><span>Wishlist</span>
    </button>
    @if (open()) { <app-wishlist-dialog (closed)="open.set(false)"></app-wishlist-dialog> }
  `,
  styles: `:host { display: inline-flex; flex-shrink: 0; }
    .wishlist-trigger { white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 9px 14px; border: 1px solid #c9b4d4; border-radius: 20px; background: var(--lavender); color: var(--purple); font: inherit; font-size: .8rem; font-weight: 700; cursor: pointer; }
    .wishlist-trigger:focus-visible { outline: 2px solid var(--purple); outline-offset: 3px; }
    svg { flex-shrink: 0; }
    @media (max-width: 600px) { .wishlist-trigger { padding: 8px 10px; font-size: .72rem; } }`
})
export class WishlistTriggerComponent {
  readonly open = signal(false);
}
