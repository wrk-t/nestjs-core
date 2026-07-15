import { SetMetadata } from "@nestjs/common";

export enum Role {
  SUPER_ADMIN = "super-admin",
  ADMIN = "admin",
  ADMINISTRATOR = "administrator",
  PROVIDER = "provider",
  CONSUMER = "consumer",
}

export const ROLES_KEY = "roles";
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
