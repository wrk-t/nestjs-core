import {
  HttpException,
  InternalServerErrorDto,
  NotFoundDto,
  UnauthorizedDto,
} from "@wrk-t/ts-exc";

export function isError(error: unknown): error is HttpException {
  return error instanceof HttpException;
}

export function isSuccess<T>(result: T | HttpException): result is T {
  return !isError(result);
}

export function handleAuthError<T>(
  result: T | HttpException,
): T | HttpException {
  if (isError(result) && result instanceof NotFoundDto) {
    return new UnauthorizedDto("errors.email_or_password_is_wrong");
  }
  return result;
}

export async function catchToResult<T>(
  fn: () => Promise<T> | T,
  errorFactory?: (error: unknown) => HttpException,
): Promise<T | HttpException> {
  try {
    return await fn();
  } catch (error) {
    if (errorFactory) {
      return errorFactory(error);
    }
    if (isError(error)) {
      return error;
    }
    return new InternalServerErrorDto("errors.internal_server_error").details({
      cause: String(error),
    });
  }
}

export type ServiceResult<T> = T | HttpException;

export const unwrapOrThrow = <T>(value: T): Exclude<T, Error> => {
  if (value instanceof Error) {
    throw value;
  }
  return value as Exclude<T, Error>;
};

export const unwrapOr = <T, F>(
  value: T,
  fallbackValue: F,
): Exclude<T | F, Error> => {
  if (value instanceof Error) {
    return fallbackValue as Exclude<T | F, Error>;
  }
  return value as Exclude<T | F, Error>;
};
