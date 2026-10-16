import { Schema, model } from 'mongoose';

const activitySchema = new Schema({
  userId: { type: String, required: true },
  userEmail: { type: String, required: true },
  userName: String,
  bookId: { type: String, required: true },
  title: { type: String, required: true },
  authors: { type: [String], default: [] },
  coverUrl: String,
  format: { type: String, required: true },
  action: { type: String, enum: ['download', 'kindle'], required: true },
  occurredAt: { type: Date, required: true, default: Date.now }
});
activitySchema.index({ userId: 1, occurredAt: -1, _id: -1 });
activitySchema.index({ occurredAt: -1, _id: -1 });
export const ActivityModel = model('Activity', activitySchema);
