import { BadRequestDto, ValidationErrorDto } from "@wrk-t/ts-exc";
import {
  type ArgumentMetadata,
  Injectable,
  type PipeTransform,
} from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { I18nContext } from "nestjs-i18n";

@Injectable()
export class ValidationPipe implements PipeTransform<unknown> {
  async transform(value: unknown, { metatype }: ArgumentMetadata) {
    if (!(metatype && this.toValidate(metatype))) {
      return value;
    }
    const object = plainToInstance(metatype, value, {
      enableImplicitConversion: true,
    });
    const errors = await validate(object);
    if (errors.length > 0) {
      const details = errors.map((err) => {
        const i18n = I18nContext.current();

        const messages: string[] = err.constraints
          ? Object.entries(err.constraints).map(([, msg]) => {
              if (msg.startsWith("validation.")) {
                const parts = msg.split("|");
                const rawArgs = parts[1] ? JSON.parse(parts[1]) : {};
                const property = err.property;

                // Try i18n translation, fall back to readable message
                if (i18n) {
                  const translatedProperty = this.translateProperty(
                    i18n,
                    property,
                  );
                  return (
                    i18n.t(parts[0] as any, {
                      args: { ...rawArgs, property: translatedProperty },
                    }) ?? this.fallbackMessage(parts[0], property, rawArgs)
                  );
                }

                return this.fallbackMessage(parts[0], property, rawArgs);
              }
              return msg;
            })
          : [];

        // Also include child validation errors
        const childMessages: string[] = (err.children ?? []).flatMap(
          (child) => {
            if (!child.constraints) return [];
            return Object.entries(child.constraints).map(([, msg]) => {
              if (msg.startsWith("validation.")) {
                const parts = msg.split("|");
                const rawArgs = parts[1] ? JSON.parse(parts[1]) : {};
                const property = `${err.property}.${child.property}`;
                if (i18n) {
                  return (
                    i18n.t(parts[0] as any, {
                      args: { ...rawArgs, property },
                    }) ?? this.fallbackMessage(parts[0], property, rawArgs)
                  );
                }
                return this.fallbackMessage(parts[0], property, rawArgs);
              }
              return msg;
            });
          },
        );

        return new ValidationErrorDto(
          [...messages, ...childMessages],
          err.property,
        );
      });

      throw new BadRequestDto(details);
    }
    return object;
  }

  /**
   * Try to translate a property name via i18n. Falls back to the raw
   * property name when the translation key doesn't exist.
   */
  private translateProperty(i18n: any, property: string): string {
    const key = `general.${property}`;
    const translated = i18n.t(key);
    // If the translation returned the key itself, the key wasn't found
    if (typeof translated === "string" && translated !== key) return translated;
    return property;
  }

  /**
   * Produce a human-readable fallback when i18n is unavailable.
   */
  private fallbackMessage(
    key: string,
    property: string,
    args: Record<string, unknown>,
  ): string {
    const constraints = args.constraints as unknown[];
    switch (key) {
      case "validation.IS_NOT_EMPTY":
        return `${property} should not be empty`;
      case "validation.IS_STRING":
        return `${property} must be a string`;
      case "validation.IS_ENUM":
        return `${property} must be one of: ${(constraints?.[0] as string[])?.join(", ") ?? "valid values"}`;
      case "validation.IS_EMAIL":
        return `${property} must be a valid email`;
      case "validation.MAX_LENGTH":
        return `${property} must be at most ${constraints?.[0]} characters`;
      case "validation.MIN_LENGTH":
        return `${property} must be at least ${constraints?.[0]} characters`;
      case "validation.IS_NUMBER":
        return `${property} must be a number`;
      case "validation.IS_BOOLEAN":
        return `${property} must be a boolean`;
      default:
        return `${property} is invalid`;
    }
  }

  private toValidate(metatype: ArgumentMetadata["metatype"]): boolean {
    const types: ArgumentMetadata["metatype"][] = [
      String,
      Boolean,
      Number,
      Array,
      Object,
    ];
    return !types.includes(metatype);
  }
}
