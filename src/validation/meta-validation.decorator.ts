import { SetMetadata } from "@nestjs/common";

export const META_VALIDATION_KEY = "meta_validation";

export const MetaValidation = (tableName: string) =>
  SetMetadata(META_VALIDATION_KEY, tableName);
