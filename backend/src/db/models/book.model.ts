import { Schema, Types, model } from 'mongoose';

export interface BookRecord {
  publicId: string;
  title: string;
  authors: Types.ObjectId[];
  authorNames: string[];
  genres: Types.ObjectId[];
  genreNames: string[];
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
  lastScannedAt: Date;
}

const bookSchema = new Schema<BookRecord>({
  publicId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  authors: [{
    type: Schema.Types.ObjectId,
    ref: 'Author'
  }],
  authorNames: [{
    type: String,
    trim: true,
    index: true
  }],
  genres: [{
    type: Schema.Types.ObjectId,
    ref: 'Genre'
  }],
  genreNames: [{
    type: String,
    trim: true,
    index: true
  }],
  publishedDate: {
    type: String,
    index: true
  },
  description: String,
  language: String,
  coverUrl: String,
  coverSource: String,
  format: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  fileName: {
    type: String,
    required: true
  },
  relativePath: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  filePath: {
    type: String,
    required: true
  },
  sizeBytes: {
    type: Number,
    required: true
  },
  lastScannedAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

bookSchema.index({
  title: 'text',
  authorNames: 'text',
  genreNames: 'text',
  description: 'text',
  fileName: 'text'
}, {
  default_language: 'none',
  language_override: 'textSearchLanguage',
  name: 'book_search_text'
});

export const BookModel = model<BookRecord>('Book', bookSchema);
