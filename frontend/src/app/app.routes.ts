import { Routes } from '@angular/router';
import { adminGuard } from './core/admin.guard';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage)
  },
  {
    path: 'books',
    canActivate: [authGuard],
    loadComponent: () => import('./features/books/books-list.page').then((m) => m.BooksListPage)
  },
  {
    path: 'books/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./features/books/book-detail.page').then((m) => m.BookDetailPage)
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile.page').then((m) => m.ProfilePage)
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin.page').then((m) => m.AdminPage)
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'books'
  },
  {
    path: '**',
    redirectTo: 'books'
  }
];
