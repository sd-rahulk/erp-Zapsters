import type { Actor } from "@/lib/types";
import type { Command } from "./validation";
import { requirePermission } from "./auth";
import { AppError, audit, get, insert, notify, required, run, today } from "./db";
import { requester, approver, recordForCompany } from "./workflow";

type Request = {id:number; employee_id:number; manager_id:number; type_id:number; start_date:string; days:number; status:string; name:string};
const balance = (employeeId: number, typeId: number, year: number) =>
  get<{remaining:number}>("SELECT remaining FROM leave_balances WHERE employee_id=? AND type_id=? AND year=?",employeeId,typeId,year)?.remaining ?? 0;

export function submitLeave(actor: Actor, command: Extract<Command,{action:"leave.submit"}>) {
  requirePermission(actor,"leave.submit");
  const employee = requester(actor,"leave.decide");
  const {start,end,typeId,reason} = command;
  if (start<today() || end<start || end.slice(0,4)!==start.slice(0,4)) {
    throw new AppError("Choose dates from today onward, in order and within one calendar year.");
  }
  const year = Number(start.slice(0,4));
  if (year>Number(today().slice(0,4))+1) throw new AppError("Requests are available for this year and next year.");
  let days = 0;
  const endDate = new Date(end+"T00:00:00Z");
  for (const date = new Date(start+"T00:00:00Z");date<=endDate;date.setUTCDate(date.getUTCDate()+1)) {
    if (date.getUTCDay()!==0 && date.getUTCDay()!==6) days++;
  }
  if (!days) throw new AppError("Choose a date range containing at least one weekday.");
  recordForCompany(actor,"leave_types",typeId,"Leave type");
  if (get(`SELECT 1 FROM leave_requests WHERE company_id=? AND employee_id=? AND NOT(status='Rejected')
      AND start_date<=? AND end_date>=?`,actor.companyId,employee.id,end,start)) {
    throw new AppError("These dates overlap an existing pending or approved request.",409);
  }
  const reserved = get<{days:number}>(`SELECT COALESCE(SUM(days),0) AS days FROM leave_requests
     WHERE company_id=? AND employee_id=? AND type_id=? AND status='Pending' AND substr(start_date,1,4)=?`,
     actor.companyId,employee.id,typeId,String(year))?.days ?? 0;
  if (days>balance(employee.id,typeId,year)-reserved) throw new AppError("This request exceeds your available balance after pending requests.",409);
  const id = insert(`INSERT INTO leave_requests(company_id,employee_id,manager_id,type_id,start_date,end_date,days,reason,status)
    VALUES(?,?,?,?,?,?,?,?,'Pending')`,actor.companyId,employee.id,employee.manager_id,typeId,start,end,days,reason);
  audit(actor,"Submitted","leave",id,null,{status:"Pending",employeeId:employee.id,managerId:employee.manager_id,start,end,days});
  notify(actor,employee.manager_id,employee.name+" submitted a leave request.","leave",id);
  return id;
}

export function decideLeave(actor: Actor, command: Extract<Command,{action:"leave.decide"}>) {
  requirePermission(actor,"leave.decide");
  const request = required(get<Request>(`SELECT r.*,e.name FROM leave_requests r JOIN employees e ON e.id=r.employee_id
    WHERE r.id=? AND r.company_id=?`,command.id,actor.companyId),"Leave request");
  const reason = approver(actor,request,command);
  const year = Number(request.start_date.slice(0,4));
  const before = {status:request.status,remaining:balance(request.employee_id,request.type_id,year)};
  if (command.outcome==="Approved") {
    const change = run(`UPDATE leave_balances SET remaining=remaining-?,updated_at=CURRENT_TIMESTAMP
      WHERE employee_id=? AND type_id=? AND year=? AND remaining>=?`,request.days,request.employee_id,request.type_id,year,request.days);
    if (!change.changes) throw new AppError("The employee no longer has enough leave for this approval.",409);
  }
  run(`UPDATE leave_requests SET status=?,decided_by=?,decided_at=CURRENT_TIMESTAMP,decision_reason=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=?`,command.outcome,actor.id,reason,request.id);
  audit(actor,command.outcome,"leave",request.id,before,{status:command.outcome,remaining:balance(request.employee_id,request.type_id,year),reason});
  notify(actor,request.employee_id,"Your leave request was "+command.outcome.toLowerCase()+".","leave",request.id);
  return request.id;
}
