import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { map, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import type { AuthResponse, UpdateProfileRequest, User, UserResponse } from './models';

const tokenStorageKey = 'alexandrya.token';
const userStorageKey = 'alexandrya.user';

function getStoredToken(): string | null {
  return localStorage.getItem(tokenStorageKey) ?? sessionStorage.getItem(tokenStorageKey);
}

function readStoredUser(): User | null {
  const raw = localStorage.getItem(userStorageKey) ?? sessionStorage.getItem(userStorageKey);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as User;
  } catch {
    localStorage.removeItem(userStorageKey);
    sessionStorage.removeItem(userStorageKey);
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly token = signal<string | null>(getStoredToken());
  readonly currentUser = signal<User | null>(readStoredUser());
  readonly isAuthenticated = computed(() => Boolean(this.token()));
  readonly isAdmin = computed(() => this.currentUser()?.role === 'admin');

  login(credentials: { email: string; password: string }, remember = true) {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/login`, credentials).pipe(
      tap((response) => this.storeSession(response, remember)),
      map((response) => response.user)
    );
  }

  logout() {
    this.clearSession();
    void this.router.navigateByUrl('/login');
  }

  clearSession() {
    localStorage.removeItem(tokenStorageKey);
    localStorage.removeItem(userStorageKey);
    sessionStorage.removeItem(tokenStorageKey);
    sessionStorage.removeItem(userStorageKey);
    this.token.set(null);
    this.currentUser.set(null);
  }

  updateProfile(payload: UpdateProfileRequest) {
    return this.http.patch<UserResponse>(`${environment.apiUrl}/auth/me`, payload).pipe(
      tap((response) => this.storeUser(response.user)),
      map((response) => response.user)
    );
  }

  private storeSession(response: AuthResponse, remember: boolean) {
    const storage = remember ? localStorage : sessionStorage;
    const otherStorage = remember ? sessionStorage : localStorage;

    otherStorage.removeItem(tokenStorageKey);
    otherStorage.removeItem(userStorageKey);
    storage.setItem(tokenStorageKey, response.token);
    storage.setItem(userStorageKey, JSON.stringify(response.user));
    this.token.set(response.token);
    this.currentUser.set(response.user);
  }

  private storeUser(user: User) {
    const storage = localStorage.getItem(tokenStorageKey) ? localStorage : sessionStorage;

    storage.setItem(userStorageKey, JSON.stringify(user));
    this.currentUser.set(user);
  }
}
