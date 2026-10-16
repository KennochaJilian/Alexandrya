import { Schema, model } from 'mongoose';

const readingProgressSchema = new Schema({
  userId: { type: String, required: true },
  bookId: { type: String, required: true },
  format: { type: String, enum: ['epub', 'pdf'], required: true },
  cfi: String,
  page: Number,
  totalPages: Number,
  scroll: { type: Number, default: 0 },
  label: { type: String, required: true },
  completed: { type: Boolean, default: false }
}, { timestamps: true });
readingProgressSchema.index({ userId: 1, bookId: 1 }, { unique: true });
readingProgressSchema.index({ userId: 1, completed: 1, updatedAt: -1 });
export const ReadingProgressModel = model('ReadingProgress', readingProgressSchema);
