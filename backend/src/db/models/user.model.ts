import { Schema, model } from 'mongoose';

export interface UserRecord {
  email: string;
  name?: string;
  passwordHash: string;
  kindleEmail?: string;
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
  }
}, {
  timestamps: true
});

export const UserModel = model<UserRecord>('User', userSchema);
