export interface User {
  id: string;
  email: string;
  name?: string;
  kindleEmail?: string;
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
  format: string;
  fileName: string;
  relativePath: string;
  sizeBytes: number;
}

export interface BookListResponse {
  books: Book[];
  total: number;
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
}

export interface KindleSendResponse {
  status: 'queued';
  messageId?: string;
  to: string;
}
