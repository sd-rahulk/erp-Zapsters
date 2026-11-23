import type { Actor } from "@/lib/types";
import type { Command } from "./validation";
import { requirePermission } from "./auth";
import { AppError, audit, get, required, run } from "./db";

export function updateInvoice(actor: Actor, command: Extract<Command,{action:"invoice.update"}>) {
  requirePermission(actor,"invoices.manage");
  const invoice = required(get<{status:string;total_minor:number}>(
    "SELECT status,total_minor FROM invoices WHERE company_id=? AND id=?",actor.companyId,command.id),"Invoice");
  if (invoice.status!=="Open") throw new AppError("Only open invoices can be updated.",409);
  if (command.outcome==="Paid") {
    run("INSERT INTO payments(invoice_id,actor_id,amount_minor,reference) VALUES(?,?,?,?)",command.id,actor.id,invoice.total_minor,command.reason);
  }
  run("UPDATE invoices SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",command.outcome,command.id);
  audit(actor,command.outcome==="Paid"?"Payment recorded":"Voided","invoices",command.id,invoice,
    {status:command.outcome,total_minor:invoice.total_minor,reference:command.reason});
  return command.id;
}
