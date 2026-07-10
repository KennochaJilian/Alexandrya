export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  email: string;
  name?: string;
  kindleEmail?: string;
  role: UserRole;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Book {
  id: string;
  title: string;
  authors: string[];
  genres: string[];
  publishedDate?: string;
  description?: string;
  language?: string;
  coverUrl?: string;
  coverSource?: string;
  format: string;
  fileName: string;
  relativePath: string;
  sizeBytes: number;
}

export interface BookListResponse {
  books: Book[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface BookResponse {
  book: Book;
}

export interface BookFilters {
  q?: string;
  title?: string;
  author?: string;
  genre?: string;
  publishedFrom?: string;
  publishedTo?: string;
  page?: number;
  pageSize?: number;
}

export interface KindleSendResponse {
  status: 'queued';
  messageId?: string;
  to: string;
}

export interface UpdateProfileRequest {
  name?: string | null;
  kindleEmail?: string | null;
  currentPassword?: string;
  newPassword?: string;
}

export interface UserResponse {
  user: User;
}

export interface UserListResponse {
  users: User[];
  total: number;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  name?: string;
  kindleEmail?: string;
  role?: UserRole;
}

export interface AdminLibraryActionResponse {
  total: number;
  indexed?: boolean;
}
