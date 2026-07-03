import { Schema, model } from 'mongoose';

export interface AuthorRecord {
  name: string;
  slug: string;
}

const authorSchema = new Schema<AuthorRecord>({
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

export const AuthorModel = model<AuthorRecord>('Author', authorSchema);
