export type UserRole = 'user' | 'admin';

export interface AppUser {
  id: string;
  email: string;
  name?: string;
  password?: string;
  passwordHash?: string;
  kindleEmail?: string;
  role?: UserRole;
}

export interface PublicUser {
  id: string;
  email: string;
  name?: string;
  kindleEmail?: string;
  role: UserRole;
}
