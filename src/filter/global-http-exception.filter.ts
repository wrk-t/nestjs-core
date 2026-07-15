import { Exception } from "@wrk-t/ts-exc";
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import { I18nService } from "nestjs-i18n";

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("HttpException");

  constructor(private readonly i18n: I18nService) {}

  catch(exception: Exception, host: ArgumentsHost) {
    const detail = (exception as any)?.debug ?? (exception as any)?.details;
    this.logger.error(
      `${exception?.constructor?.name}: ${(exception as any)?.message}`,
      detail ? JSON.stringify(detail) : undefined,
    );

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { i18nLang?: string }>();
    const status = exception.getStatus?.() ?? 500;
    const res = exception.getResponse?.() ?? {
      statusCode: status,
      message: "Internal server error",
    };
    const error = (exception as any)?.error ?? exception.name;

    const lang = ((request as any).i18nLang ??
      (request.headers as any)?.["accept-language"]?.split(",")[0]) as
      string | undefined;

    const payload =
      typeof res === "string"
        ? {
            statusCode: status,
            message: this.translateMessage(res, lang),
            error,
          }
        : {
            statusCode: status,
            error,
            ...(res as object),
            message: this.translateMessage(
              (res as Record<string, unknown>).message,
              lang,
            ),
          };

    response.status(status).json(payload);
  }

  private translateMessage(key: any, lang?: string): string | string[] {
    if (!key) return key;
    if (typeof key === "string") return this.translateOne(key, lang);
    if (Array.isArray(key))
      return key.map((k) => this.translateOne(String(k), lang));
    return key;
  }

  private translateOne(raw: string, lang?: string): string {
    if (!raw) return raw;
    const opts: any = lang ? { lang } : undefined;

    if (raw.startsWith("validation.")) {
      const pipeIdx = raw.indexOf("|");
      const i18nKey = pipeIdx === -1 ? raw : raw.slice(0, pipeIdx);

      let args: Record<string, unknown> = {};
      if (pipeIdx !== -1) {
        try {
          args = JSON.parse(raw.slice(pipeIdx + 1));
        } catch {
          // ignore
        }
      }

      try {
        const translated = this.i18n.translate(i18nKey as any, {
          ...opts,
          args,
        });
        if (translated && translated !== i18nKey) return translated as string;
      } catch {
        // fall through
      }
    }

    try {
      const translated = this.i18n.translate(raw as any, opts);
      if (typeof translated === "string" && translated !== raw)
        return translated;
    } catch {
      // fall through
    }

    return raw;
  }
}
