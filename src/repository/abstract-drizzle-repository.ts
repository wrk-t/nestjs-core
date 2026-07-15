import type { EventEmitter2 } from "@nestjs/event-emitter";
import type { TransactionHost } from "@nestjs-cls/transactional";
import { and, isNotNull, isNull, SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  TBasePgTable,
  TPgDBTransactionAdapter,
} from "../interface/postgres";

/**
 * Optional logging interface. Projects provide their own implementation
 * if they want audit logging on DB operations.
 */
export interface ILogService {
  logToAuditLogDb(entry: {
    action: string;
    resourceName: string;
    data: unknown;
  }): Promise<void>;
}

export abstract class AbstractBaseDrizzleRepository<
  T extends TBasePgTable,
  DB extends NodePgDatabase<Record<string, unknown>>,
> {
  constructor(
    protected readonly table: T,
    protected readonly txHost: TransactionHost<TPgDBTransactionAdapter>,
    protected readonly eventEmitter?: EventEmitter2,
    protected readonly logService?: ILogService,
  ) {}

  get resource() {
    // @ts-expect-error Drizzle internal symbol
    return this.table[Symbol.for("drizzle:Name")] as string;
  }

  get db() {
    // @ts-expect-error Drizzle tx host type
    return this.txHost.tx || this.txHost.host;
  }

  protected applyIsDeleted(condition?: SQL): SQL {
    const tenantFilter = isNotNull(this.table.deletedAt);
    // @ts-expect-error Drizzle SQL types
    return condition ? and(tenantFilter, condition) : tenantFilter;
  }

  protected applyIsNotDeleted(condition?: SQL): SQL {
    const tenantFilter = isNull(this.table.deletedAt);
    // @ts-expect-error Drizzle SQL types
    return condition ? and(tenantFilter, condition) : tenantFilter;
  }

  public async execute<R>(
    process: (db: DB) => Promise<R>,
    action: string,
  ): Promise<R> {
    try {
      // @ts-expect-error Drizzle db type
      const result = await process(this.db);

      if (!result && (action === "create" || action === "update")) {
        this.eventEmitter?.emit("log.elastic", {
          kind: "db-operation",
          action,
          resourceName: this.resource,
          status: "error",
          data: {},
        });
      } else {
        this.eventEmitter?.emit("log.elastic", {
          kind: "db-operation",
          action,
          resourceName: this.resource,
          status: "success",
          data: result,
        });

        if (
          action !== "read" &&
          this.resource !== "audit_log" &&
          this.logService
        ) {
          await this.logService.logToAuditLogDb({
            action,
            resourceName: this.resource,
            data: result,
          });
        }
      }

      return result;
    } catch (error) {
      this.eventEmitter?.emit("log.elastic", {
        kind: "db-operation",
        action,
        resourceName: this.resource,
        status: "failure",
        data: error,
      });
      if (this.resource === "audit_logs") {
        this.eventEmitter?.emit("log.file", {
          kind: "db-operation",
          action,
          status: "failure",
          data: error,
        });
      }
      throw error;
    }
  }
}
