import type { Request } from "express";
import type { JwtPayload } from "jsonwebtoken";

/**
 * Augmented Express Request populated by AuthGuard.
 * The user type is generic — each project provides its own user DTO.
 */
export interface IVerifiedRequest<TUser = Record<string, unknown>>
  extends Request {
  meta: {
    user: TUser;
    jwt: Required<JwtPayload>;
    tenantId?: string;
    roles: Array<{ id: string; name?: string; displayName?: string }>;
  };
}
