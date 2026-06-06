import type { SQL } from "drizzle-orm";
import type { TBasePgTable } from "./postgres";

export interface IBaseDrizzleRepository<T extends TBasePgTable> {
  applyScope(condition?: SQL): SQL | undefined;

  softDeleteOne(query: SQL): Promise<T["$inferSelect"] | null>;
  softDeleteOneById(id: string): Promise<T["$inferSelect"] | null>;

  deleteOne(query: SQL): Promise<T["$inferSelect"] | null>;
  deleteOneById(id: string): Promise<T["$inferSelect"] | null>;
  deleteBulk(query: SQL): Promise<T["$inferSelect"][]>;
  deleteBulkByIds(ids: string[]): Promise<T["$inferSelect"][]>;

  selectOne(query: SQL): Promise<T["$inferSelect"] | null>;
  selectOneById(id: string): Promise<T["$inferSelect"] | null>;
  selectMany(query: SQL): Promise<T["$inferSelect"][]>;
  selectAll(): Promise<T["$inferSelect"][]>;

  findMany(props: {
    page?: number | null;
    limit?: number | null;
    searchFields?: (keyof T["$inferSelect"] | (string & {}))[];
    search?: string;
    sortBy?: keyof T["$inferSelect"];
    sortOrder?: "asc" | "desc";
    include?: string[];
  }): Promise<{
    data: T["$inferSelect"][];
    total: number | null;
    page: number;
    limit: number | null;
    totalPages: number | null;
  }>;

  findFirst(props: {
    searchFields?: (keyof T["$inferSelect"] | (string & {}))[];
    search?: string;
    sortBy?: keyof T["$inferSelect"];
    sortOrder?: "asc" | "desc";
    include?: string[];
  }): Promise<T["$inferSelect"] | null>;

  createOne(data: T["$inferInsert"]): Promise<T["$inferSelect"][]>;
  createBulk(data: T["$inferInsert"][]): Promise<T["$inferSelect"][]>;

  updateOne(
    query: SQL,
    data: Partial<T["$inferInsert"]>,
  ): Promise<T["$inferSelect"] | null>;
  updateOneById(
    id: string,
    data: Partial<T["$inferInsert"]>,
  ): Promise<T["$inferSelect"] | null>;
}
