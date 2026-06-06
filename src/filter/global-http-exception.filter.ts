import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import type { Response } from "express";

/**
 * Global HTTP exception filter that formats all thrown HttpExceptions
 * into a consistent JSON response: { statusCode, message, error, ... }.
 */
@Catch(HttpException)
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const res = exception.getResponse();
    // biome-ignore lint/suspicious/noExplicitAny: NestJS exception type
    const error = (exception as any)?.error ?? exception.name;

    const payload =
      typeof res === "string"
        ? { statusCode: status, message: res, error }
        : { statusCode: status, error, ...(res as object) };

    response.status(status).json(payload);
  }
}
