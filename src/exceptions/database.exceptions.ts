import {
  ConflictException,
  InternalServerErrorException,
} from "@nestjs/common";

export class DuplicateKeyException extends ConflictException {
  constructor(field: string, value: string) {
    super(`Resource with ${field} '${value}' already exists`);
  }
}

export class ForeignKeyViolationException extends ConflictException {
  constructor(message = "Cannot perform operation due to related records") {
    super(message);
  }
}

export class DatabaseOperationException extends InternalServerErrorException {
  constructor(operation: string, details?: string) {
    super(
      `Database ${operation} operation failed${details ? `: ${details}` : ""}`,
    );
  }
}
