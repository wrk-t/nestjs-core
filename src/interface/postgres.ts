import type {
  PgColumn,
  PgDatabase,
  PgTableWithColumns,
  TableConfig,
} from "drizzle-orm/pg-core";

// biome-ignore lint/suspicious/noExplicitAny: generic DB type
export type TPgDB = PgDatabase<any>;

export type TPgDBTransactionAdapter = TransactionalAdapterDrizzleOrm<TPgDB>;

export interface IBasePostgresTableConfig extends TableConfig {
  columns: {
    id: PgColumn;
    createdAt: PgColumn;
    updatedAt: PgColumn;
    deletedAt: PgColumn;
  };
}

export type TBasePgTable = PgTableWithColumns<IBasePostgresTableConfig>;

/**
 * Merges the base select type with included relation keys.
 */
export type TWithRelations<
  TBase extends Record<string, unknown>,
  TRelations extends Record<string, unknown>,
> = TBase & {
  [K in keyof TRelations]: TRelations[K] extends unknown[]
    ? TRelations[K] | undefined
    : TRelations[K] | null | undefined;
};

// Re-export TransactionalAdapterDrizzleOrm type without requiring the adapter package
import type { TransactionalAdapterDrizzleOrm } from "@nestjs-cls/transactional-adapter-drizzle-orm";
