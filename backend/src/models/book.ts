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
  filePath: string;
  sizeBytes: number;
  addedAt?: string;
}

export type PublicBook = Omit<Book, 'filePath'>;

export interface BookSearchFilters {
  q?: string;
  title?: string;
  author?: string;
  genre?: string;
  publishedFrom?: string;
  publishedTo?: string;
  page?: number;
  pageSize?: number;
}

export interface BookSearchResult {
  books: PublicBook[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
