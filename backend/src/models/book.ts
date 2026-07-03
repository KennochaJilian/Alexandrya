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
  filePath: string;
  sizeBytes: number;
}

export type PublicBook = Omit<Book, 'filePath'>;

export interface BookSearchFilters {
  q?: string;
  title?: string;
  author?: string;
  genre?: string;
  publishedFrom?: string;
  publishedTo?: string;
}
