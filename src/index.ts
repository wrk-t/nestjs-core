// ── Repository ─────────────────────────────────────────────
export { AbstractBaseDrizzleRepository } from "./repository/abstract-drizzle-repository";
export type { ILogService } from "./repository/abstract-drizzle-repository";
export { BasePostgresRepository } from "./repository/base-postgres-repository";
export type { ScopeContext } from "./repository/base-postgres-repository";
export type { IncludeValue, IncludeKeysOf } from "./repository/base-postgres-repository";
export { Repository } from "./repository/repository";

// ── Service ────────────────────────────────────────────────
export { ScopedBaseService } from "./service/scoped-base.service";
export type { ITranslationService } from "./service/scoped-base.service";

// ── Context ────────────────────────────────────────────────
export { RequestContext } from "./context/request.context";
export type { TScope, ScopeMap } from "./context/request.context";

// ── Utils ──────────────────────────────────────────────────
export { isError, isSuccess, unwrapOrThrow, catchToResult, handleAuthError, unwrapOr } from "./utils/error";
export type { ServiceResult } from "./utils/error";
export { hashPassword, comparePassword } from "./utils/password";

// ── Validation ──────────────────────────────────────────────
export { ValidationPipe } from "./validation/validation-pipe";
export { MetaValidation, META_VALIDATION_KEY } from "./validation/meta-validation.decorator";

// ── Decorators ──────────────────────────────────────────────
export { Roles, ROLES_KEY, Role } from "./decorator/roles.decorator";

// ── Guards ──────────────────────────────────────────────────
export { RolesGuard } from "./guard/roles.guard";

// ── Interface ──────────────────────────────────────────────
export type { IBaseDrizzleRepository } from "./interface/drizzle";
export type { IVerifiedRequest } from "./interface/express";
export type {
  TBasePgTable,
  TWithRelations,
  TPgDB,
  TPgDBTransactionAdapter,
} from "./interface/postgres";

// ── Exceptions ─────────────────────────────────────────────
export {
  DuplicateKeyException,
  ForeignKeyViolationException,
  DatabaseOperationException,
} from "./exceptions/database.exceptions";

// ── Filter ─────────────────────────────────────────────────
export { GlobalHttpExceptionFilter } from "./filter/global-http-exception.filter";

// ── Access Control ────────────────────────────────────────
export { AccessControlService } from "./access-control/access-control.service";
export type { OwnerResult } from "./access-control/access-control.service";
