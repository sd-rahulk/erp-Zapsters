import type { Actor } from "@/lib/types";
import { AppError, get, required } from "./db";

type CompanyTable = "leave_types"|"products"|"warehouses"|"suppliers"|"departments"|"employees"|"users";
export function recordForCompany<T>(actor: Actor, table: CompanyTable, id: number, name: string) {
  return required(get<T>(`SELECT * FROM ${table} WHERE company_id=? AND id=?`,actor.companyId,id),name);
}
export function requester(actor: Actor, permission: "leave.decide"|"purchasing.decide") {
  const employee = get<{id:number; manager_id:number; name:string}>(`
    SELECT e.id,e.manager_id,e.name FROM employees e JOIN employees m ON m.id=e.manager_id AND m.company_id=e.company_id AND m.active=1
      JOIN users u ON u.id=m.user_id AND u.company_id=m.company_id
      JOIN role_assignments ra ON ra.user_id=u.id JOIN role_permissions rp ON rp.role_id=ra.role_id AND rp.permission_id=?
    WHERE e.id=? AND e.company_id=? AND e.active=1`,permission,actor.employeeId,actor.companyId);
  if (!employee) throw new AppError("Your employee profile needs an active manager with approval access before you can submit.");
  return employee;
}
export function approver(actor: Actor, request: {employee_id:number; manager_id:number; status:string},
  decision: {outcome:string; reason?:string}) {
  if (!actor.employeeId || actor.employeeId===request.employee_id || actor.employeeId!==request.manager_id ||
      !get("SELECT 1 FROM employees WHERE id=? AND company_id=? AND manager_id=?",request.employee_id,actor.companyId,actor.employeeId)) {
    throw new AppError("Only the assigned direct manager can decide this request.",403);
  }
  if (request.status!=="Pending") throw new AppError("This request has already been decided.",409);
  if (decision.outcome==="Rejected" && (decision.reason?.length ?? 0)<4) {
    throw new AppError("Enter a rejection reason of at least four characters.");
  }
  return decision.reason || null;
}
