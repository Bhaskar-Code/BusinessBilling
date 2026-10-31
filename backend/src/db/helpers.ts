import { SqlValue } from 'sql.js';
import { getDb, saveDb } from '../db/database';

export { saveDb };

// sql.js BindParams accepts: SqlValue[] | { [key: string]: SqlValue }
// SqlValue = number | string | null | Uint8Array
export type Params = { [key: string]: any };

export function execQuery(sql: string, params: Params = {}): Record<string, SqlValue>[] {
  const db = getDb();
  const results: Record<string, SqlValue>[] = [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) {
    results.push(stmt.getAsObject() as Record<string, SqlValue>);
  }
  stmt.free();
  return results;
}

export function execRun(sql: string, params: Params = {}): void {
  const db = getDb();
  const stmt = db.prepare(sql);
  stmt.run(params);
  stmt.free();
}

export function r(n: number): number {
  return Math.round(n * 100) / 100;
}
