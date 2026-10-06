import { AsyncLocalStorage } from "node:async_hooks";

// The subset of the Cloudflare D1 binding used by this application.
export interface DatabaseResult<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: { changes: number };
}
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<DatabaseResult<T>>;
  run<T = Record<string, unknown>>(): Promise<DatabaseResult<T>>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch<T = Record<string, unknown>>(statements: Statement[]): Promise<DatabaseResult<T>[]>;
}
export interface WorkerEnvironment {
  DB?: Database;
  AUTH_DB?: Database;
  AUTH_COOKIE_NAME?: string;
  AUTH_TABLE_PREFIX?: string;
  OWNER_EMAIL_HASH?: string;
  AI_PROVIDER?: string;
  AI_MODEL?: string;
  AI?: WorkersAi;
  REQUEST_RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

export interface WorkersAi {
  run(model: string, input: {
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    stream: true;
    max_tokens: number;
  }): Promise<ReadableStream<Uint8Array>>;
}

const requestEnvironment = new AsyncLocalStorage<WorkerEnvironment>();
export function withWorkerEnvironment<T>(env: WorkerEnvironment, action: () => T): T {
  return requestEnvironment.run(env, action);
}
export function workerEnvironment() {
  const env = requestEnvironment.getStore();
  if (!env) throw new Error("Worker bindings are unavailable outside a request");
  return env;
}
export function appDatabase() {
  const db = workerEnvironment().DB;
  if (!db) throw new Error("Application D1 database is not configured");
  return db;
}
