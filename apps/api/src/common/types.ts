import { UserRole } from './enums';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  name: string;
}
