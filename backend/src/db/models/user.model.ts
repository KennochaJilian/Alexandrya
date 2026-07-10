import { Schema, model } from 'mongoose';

export type UserRole = 'user' | 'admin';

export interface UserRecord {
  email: string;
  name?: string;
  passwordHash: string;
  kindleEmail?: string;
  role?: UserRole;
}

const userSchema = new Schema<UserRecord>({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    trim: true
  },
  passwordHash: {
    type: String,
    required: true,
    select: false
  },
  kindleEmail: {
    type: String,
    lowercase: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
    index: true
  }
}, {
  timestamps: true
});

export const UserModel = model<UserRecord>('User', userSchema);
