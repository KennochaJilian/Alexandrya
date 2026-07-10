import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideLockKeyhole, LucideLogIn, LucideMail } from '@lucide/angular';
import { readApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login-page',
  imports: [CommonModule, ReactiveFormsModule, LucideLockKeyhole, LucideLogIn, LucideMail],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss'
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    remember: new FormControl(true, { nonNullable: true })
  });
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  submit() {
    console.log('Form submitted:', this.form.getRawValue());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.error.set(null);

    const { email, password, remember } = this.form.getRawValue();

    this.auth.login({ email, password }, remember).subscribe({
      next: () => void this.router.navigateByUrl('/books'),
      error: (error: unknown) => {
        this.error.set(readApiError(error));
        this.isSubmitting.set(false);
      }
    });
  }
}
