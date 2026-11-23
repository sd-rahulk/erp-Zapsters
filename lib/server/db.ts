import { database, transaction as transact } from "@/db/sqlite.mjs";
import type { SQLInputValue } from "node:sqlite";
import type { Actor, Row } from "@/lib/types";

export function all<T = Row>(sql: string, ...params: SQLInputValue[]): T[] {
  return database().prepare(sql).all(...params).map(row=>({...row}) as T);
}
export function get<T = Row>(sql: string, ...params: SQLInputValue[]): T | undefined {
  const row = database().prepare(sql).get(...params);
  return row ? {...row} as T : undefined;
}
export function run(sql: string, ...params: SQLInputValue[]) {
  return database().prepare(sql).run(...params);
}
export function insert(sql: string, ...params: SQLInputValue[]) {
  return Number(run(sql,...params).lastInsertRowid);
}
export function transaction<T>(work: () => T) {
  return transact(database(),work);
}
export class AppError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new AppError(name+" was not found.",404);
  return value;
}
export function audit(actor: Actor, action: string, entity: string, id: number, before: unknown, after: unknown) {
  run("INSERT INTO audit_events(company_id,actor_id,action,entity,entity_id,before_json,after_json) VALUES(?,?,?,?,?,?,?)",
    actor.companyId,actor.id,action,entity,id,before==null?null:JSON.stringify(before),after==null?null:JSON.stringify(after));
}
export function notify(actor: Actor, employeeId: number, message: string, module: string, id: number) {
  run(`INSERT INTO notifications(company_id,user_id,message,module,entity_id)
       SELECT e.company_id,e.user_id,?,?,? FROM employees e JOIN users u ON u.id=e.user_id AND u.company_id=e.company_id
       WHERE e.company_id=? AND e.id=?`,message,module,id,actor.companyId,employeeId);
}
export const today = () => new Date().toISOString().slice(0,10);
