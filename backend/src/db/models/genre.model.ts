import { Schema, model } from 'mongoose';

export interface GenreRecord {
  name: string;
  slug: string;
}

const genreSchema = new Schema<GenreRecord>({
  name: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    index: true
  }
}, {
  timestamps: true
});

export const GenreModel = model<GenreRecord>('Genre', genreSchema);
