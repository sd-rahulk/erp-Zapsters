import { can, type Actor } from "@/lib/types";

// The captured manager owns the decision. Reading a team request also requires the current reporting line.
export function requestScope(actor: Actor, kind: "leave"|"purchasing", alias = "r") {
  if (kind==="leave" && can(actor,"employees.manage")) return {sql:"1=1",params:[]};
  if (can(actor,kind+".decide")) return {
    sql:`(${alias}.employee_id=? OR (${alias}.manager_id=? AND EXISTS(
      SELECT 1 FROM employees member WHERE member.id=${alias}.employee_id AND member.company_id=${alias}.company_id AND member.manager_id=?
    )))`,params:[actor.employeeId,actor.employeeId,actor.employeeId],
  };
  return {sql:`${alias}.employee_id=?`,params:[actor.employeeId]};
}
export function employeeScope(actor: Actor) {
  if (can(actor,"employees.manage")) return {sql:"1=1",params:[]};
  if (can(actor,"leave.decide")) return {sql:"(e.id=? OR e.manager_id=?)",params:[actor.employeeId,actor.employeeId]};
  return {sql:"e.id=?",params:[actor.employeeId]};
}
export function orderScope(actor: Actor, alias="o") {
  if (can(actor,"orders.read")) return {sql:"1=1",params:[]};
  const scope = requestScope(actor,"purchasing","pr");
  return {sql:`EXISTS(SELECT 1 FROM purchase_requests pr WHERE pr.id=${alias}.request_id AND pr.company_id=${alias}.company_id AND ${scope.sql})`,params:scope.params};
}
