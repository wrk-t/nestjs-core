/**
 * Error handling utilities for the "error as value" pattern.
 *
 * Services return errors (HttpException subclasses) instead of throwing.
 * Controllers use `unwrapOrThrow` to throw the error for NestJS to catch.
 */

/**
 * Type guard: checks if a value is an HttpException-like object.
 */
export function isError(
  error: unknown,
): error is { getStatus: () => number; message: string; name: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "getStatus" in error &&
    typeof (error as Record<string, unknown>).getStatus === "function"
  );
}

/**
 * Type guard: checks if a value is NOT an error (success value).
 */
export function isSuccess<T>(
  result: T | { getStatus: () => number },
): result is T {
  return !isError(result);
}

/**
 * Extracts the success value, throwing if it's an error.
 * Used in controllers to convert returned errors to thrown exceptions.
 *
 * @example
 * const result = await service.method(); // returns T | Error
 * const data = unwrapOrThrow(result);     // throws if error, returns T
 */
export const unwrapOrThrow = <T>(
  value: T,
): Exclude<T, { getStatus: () => number }> => {
  if (isError(value)) {
    throw value;
  }
  return value as Exclude<T, { getStatus: () => number }>;
};

/**
 * Service result type alias.
 */
export type ServiceResult<T> =
  | T
  | { getStatus: () => number; message: string; name: string };
