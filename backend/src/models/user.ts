export interface AppUser {
  id: string;
  email: string;
  name?: string;
  password?: string;
  passwordHash?: string;
  kindleEmail?: string;
}

export interface PublicUser {
  id: string;
  email: string;
  name?: string;
  kindleEmail?: string;
}
