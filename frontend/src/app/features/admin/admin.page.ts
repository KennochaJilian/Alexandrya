import { CommonModule } from '@angular/common';
import { Component, inject, signal, type WritableSignal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideCircleUser,
  LucideDatabase,
  LucideLogOut,
  LucideRefreshCw,
  LucideSave,
  LucideSearch,
  LucideShield,
  LucideUserPlus,
  LucideUsersRound
} from '@lucide/angular';
import { finalize, switchMap, takeWhile, timer } from 'rxjs';
import { readApiError } from '../../core/api-error';
import { AdminService } from '../../core/admin.service';
import { AuthService } from '../../core/auth.service';
import type { AdminMaintenanceJob, CreateUserRequest, User, UserRole } from '../../core/models';
import { LeafSpinnerComponent } from '../../shared/leaf-spinner.component';

@Component({
  selector: 'app-admin-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    LucideArrowLeft,
    LucideCircleUser,
    LucideDatabase,
    LucideLogOut,
    LucideRefreshCw,
    LucideSave,
    LucideSearch,
    LucideShield,
    LucideUserPlus,
    LucideUsersRound,
    LeafSpinnerComponent
  ],
  templateUrl: './admin.page.html',
  styleUrl: './admin.page.scss'
})
export class AdminPage {
  private readonly adminService = inject(AdminService);
  private readonly auth = inject(AuthService);

  readonly users = signal<User[]>([]);
  readonly userMessage = signal<string | null>(null);
  readonly maintenanceMessage = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly isLoadingUsers = signal(true);
  readonly isCreatingUser = signal(false);
  readonly isRescanning = signal(false);
  readonly isReindexing = signal(false);

  readonly userForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
    name: new FormControl('', { nonNullable: true }),
    kindleEmail: new FormControl('', { nonNullable: true, validators: [Validators.email] }),
    role: new FormControl<UserRole>('user', { nonNullable: true })
  });

  constructor() {
    this.loadUsers();
  }

  createUser() {
    this.error.set(null);
    this.userMessage.set(null);

    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    const rawValue = this.userForm.getRawValue();
    const payload: CreateUserRequest = {
      email: rawValue.email,
      password: rawValue.password,
      role: rawValue.role,
      name: rawValue.name.trim() || undefined,
      kindleEmail: rawValue.kindleEmail.trim() || undefined
    };

    this.isCreatingUser.set(true);

    this.adminService.createUser(payload).pipe(
      finalize(() => this.isCreatingUser.set(false))
    ).subscribe({
      next: ({ user }) => {
        this.userMessage.set(`Utilisateur ${user.email} cree.`);
        this.userForm.reset({
          email: '',
          password: '',
          name: '',
          kindleEmail: '',
          role: 'user'
        });
        this.loadUsers();
      },
      error: (error: unknown) => this.error.set(readApiError(error))
    });
  }

  rescanLibrary() {
    this.runMaintenanceAction('rescan');
  }

  reindexSearch() {
    this.runMaintenanceAction('reindex');
  }

  logout() {
    this.auth.logout();
  }

  private loadUsers() {
    this.isLoadingUsers.set(true);

    this.adminService.listUsers().pipe(
      finalize(() => this.isLoadingUsers.set(false))
    ).subscribe({
      next: ({ users }) => this.users.set(users),
      error: (error: unknown) => this.error.set(readApiError(error))
    });
  }

  private runMaintenanceAction(action: 'rescan' | 'reindex') {
    this.error.set(null);
    this.maintenanceMessage.set(null);

    const request = action === 'rescan'
      ? this.adminService.rescanLibrary()
      : this.adminService.reindexSearch();

    const loadingSignal = action === 'rescan'
      ? this.isRescanning
      : this.isReindexing;

    loadingSignal.set(true);

    request.subscribe({
      next: ({ job }) => {
        this.maintenanceMessage.set(action === 'rescan'
          ? 'Scan lance.'
          : 'Indexation lancee.');
        this.pollMaintenanceJob(action, job.id, loadingSignal);
      },
      error: (error: unknown) => {
        loadingSignal.set(false);
        this.error.set(readApiError(error));
      }
    });
  }

  private pollMaintenanceJob(
    action: 'rescan' | 'reindex',
    jobId: string,
    loadingSignal: WritableSignal<boolean>
  ) {
    timer(0, 2000).pipe(
      switchMap(() => this.adminService.getMaintenanceJob(jobId)),
      takeWhile(({ job }) => job.status === 'running', true),
      finalize(() => loadingSignal.set(false))
    ).subscribe({
      next: ({ job }) => this.updateMaintenanceMessage(action, job),
      error: (error: unknown) => {
        this.error.set(readApiError(error));
      }
    });
  }

  private updateMaintenanceMessage(action: 'rescan' | 'reindex', job: AdminMaintenanceJob) {
    if (job.status === 'running') {
      this.maintenanceMessage.set(action === 'rescan'
        ? 'Scan en cours...'
        : 'Indexation en cours...');
      return;
    }

    if (job.status === 'failed') {
      this.error.set(job.error ?? 'La tache de maintenance a echoue.');
      this.maintenanceMessage.set(null);
      return;
    }

    const total = job.result?.total ?? 0;

    this.maintenanceMessage.set(action === 'rescan'
      ? `${total} livre(s) rescannes.`
      : `${total} livre(s) reindexes dans Typesense.`);
  }
}
