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
  addedAt?: string;
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

export interface AdminBookUploadResponse {
  books: Book[];
  total: number;
}

export type AdminMaintenanceJobStatus = 'running' | 'completed' | 'failed';
export type AdminMaintenanceJobType = 'library-rescan' | 'search-reindex';

export interface AdminMaintenanceJob {
  id: string;
  type: AdminMaintenanceJobType;
  status: AdminMaintenanceJobStatus;
  startedAt: string;
  finishedAt?: string;
  result?: AdminLibraryActionResponse;
  error?: string;
}

export interface AdminMaintenanceJobResponse {
  job: AdminMaintenanceJob;
}
