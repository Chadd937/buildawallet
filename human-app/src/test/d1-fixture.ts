import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { Database, DatabaseResult, Statement } from "@/lib/db/context.server";

/** SQLite executes the production D1 SQL; batches mirror D1's transaction boundary. */
export class TestD1 implements Database {
  readonly sqlite = new DatabaseSync(":memory:");
  prepare(sql: string): Statement {
    const db = this.sqlite;
    let params: SQLInputValue[] = [];
    const execute = <T>(): DatabaseResult<T> => {
      const stmt = db.prepare(sql);
      const results = stmt.all(...params) as T[];
      const changes = (db.prepare("SELECT changes() AS n").get() as { n: number }).n;
      return { results, success: true, meta: { changes } };
    };
    const statement: Statement = {
      bind(...values) {
        params = values as SQLInputValue[];
        return statement;
      },
      async first<T>() {
        return execute<T>().results[0] ?? null;
      },
      async all<T>() {
        return execute<T>();
      },
      async run<T>() {
        return execute<T>();
      },
    };
    return statement;
  }
  async batch<T>(statements: Statement[]): Promise<DatabaseResult<T>[]> {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results: DatabaseResult<T>[] = [];
      for (const stmt of statements) results.push(await stmt.all<T>());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.sqlite.close();
  }
}
