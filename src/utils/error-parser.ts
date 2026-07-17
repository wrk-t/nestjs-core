import { ConflictDto } from "@wrk-t/ts-exc";
import {
  DatabaseOperationException,
  DuplicateKeyException,
  ForeignKeyViolationException,
} from "../exceptions/database.exceptions";

/**
 * Parse a database error and throw the appropriate HTTP exception.
 * Handles both MySQL and PostgreSQL error codes.
 */
// biome-ignore lint/suspicious/noExplicitAny: Database error object varies by provider and driver
export function parseDatabaseError(error: any, operation: string): never {
  // MySQL error codes
  if (error.code === "ER_DUP_ENTRY" || error.errno === 1062) {
    // biome-ignore lint/performance/useTopLevelRegex: Error message format is provider-specific
    const match = error.message.match(/for key '(.+?)'/);
    const field = match ? match[1] : "unknown";
    throw new DuplicateKeyException(field, "provided value");
  }

  if (error.code === "ER_NO_REFERENCED_ROW_2" || error.errno === 1452) {
    throw new ConflictDto("errors.foreign_key_violation").details({
      code: error.code,
      operation,
    });
  }

  if (error.code === "ER_ROW_IS_REFERENCED_2" || error.errno === 1451) {
    throw new ConflictDto("errors.cannot_delete_with_references").details({
      code: error.code,
      operation,
    });
  }

  // PostgreSQL error codes
  if (error.code === "23505") {
    // biome-ignore lint/performance/useTopLevelRegex: Error message format is provider-specific
    const match = error.detail?.match(/Key \((.+?)\)=/);
    const field = match ? match[1] : "unknown";
    throw new DuplicateKeyException(field, "provided value");
  }

  if (error.code === "23503") {
    throw new ForeignKeyViolationException();
  }

  throw new DatabaseOperationException(operation, error.message);
}
