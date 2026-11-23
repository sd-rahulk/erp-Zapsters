import { hashPassword } from "@/db/password.mjs";
import { type Actor, type Row } from "@/lib/types";
import { requirePermission } from "./auth";
import { AppError, all, audit, get, insert, notify, required, run, today } from "./db";
import type { Command } from "./validation";
import { recordForCompany } from "./workflow";

export function saveSupplier(actor: Actor, command: Extract<Command,{action:"supplier.save"}>) {
  requirePermission(actor,"suppliers.manage");
  const {name,email,category} = command;
  const duplicate = get<{id:number}>("SELECT id FROM suppliers WHERE company_id=? AND name=? COLLATE NOCASE",actor.companyId,name);
  if (duplicate && duplicate.id!==command.id) throw new AppError("A supplier already uses that name.",409);
  const before = command.id ? recordForCompany<Row>(actor,"suppliers",command.id,"Supplier") : null;
  let id = command.id;
  if (id) run("UPDATE suppliers SET name=?,email=?,category=? WHERE id=?",name,email,category,id);
  else id = insert("INSERT INTO suppliers(company_id,name,email,category) VALUES(?,?,?,?)",actor.companyId,name,email,category);
  audit(actor,before?"Updated":"Created","suppliers",id,before,{name,email,category});
  return id;
}
export function saveEmployee(actor: Actor, command: Extract<Command,{action:"employee.save"}>) {
  requirePermission(actor,"employees.manage");
  const {name,email,title,departmentId,managerId,active} = command;
  recordForCompany(actor,"departments",departmentId,"Department");
  if (managerId) {
    recordForCompany(actor,"employees",managerId,"Manager");
    const valid = get(`SELECT 1 FROM employees e JOIN role_assignments r ON r.user_id=e.user_id
      WHERE e.company_id=? AND e.id=? AND e.active=1 AND r.role_id='Manager'`,actor.companyId,managerId);
    if (!valid) throw new AppError("Select an active employee with the Manager role.");
    const cycle = get(`WITH RECURSIVE chain(id) AS (
        SELECT ? UNION SELECT e.manager_id FROM employees e JOIN chain c ON c.id=e.id WHERE e.company_id=? AND e.manager_id IS NOT NULL
      ) SELECT 1 FROM chain WHERE id=?`,managerId,actor.companyId,command.id??null);
    if (cycle) throw new AppError("This reporting relationship would create a cycle.");
  }
  const duplicate = get<{id:number}>("SELECT id FROM employees WHERE company_id=? AND email=? COLLATE NOCASE",actor.companyId,email);
  if (duplicate && duplicate.id!==command.id) throw new AppError("An employee already uses that email.",409);
  const before = command.id ? recordForCompany<Row>(actor,"employees",command.id,"Employee") : null;
  if (!active && command.id && get("SELECT 1 FROM employees WHERE company_id=? AND manager_id=? AND active=1",actor.companyId,command.id)) {
    throw new AppError("Reassign this manager’s active direct reports before deactivating the profile.",409);
  }
  const linked = before?.user_id ?? get<{id:number}>("SELECT id FROM users WHERE company_id=? AND email=? COLLATE NOCASE",actor.companyId,email)?.id ?? null;
  if (linked && get("SELECT 1 FROM employees WHERE company_id=? AND user_id=? AND id<>?",actor.companyId,linked,command.id??0)) {
    throw new AppError("That account is already linked to another employee.",409);
  }
  let id = command.id;
  if (id) {
    if (before?.manager_id!==managerId) {
      for (const [table,module] of [["leave_requests","leave"],["purchase_requests","purchasing"]]) {
        const pending = all<{id:number; manager_id:number}>(`SELECT id,manager_id FROM ${table} WHERE company_id=? AND employee_id=? AND status='Pending'`,actor.companyId,id);
        if (pending.length && !managerId) throw new AppError("Assign a manager while the employee has pending requests.",409);
        for (const request of pending) {
          run(`UPDATE ${table} SET manager_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,managerId,request.id);
          audit(actor,"Reassigned approval",module,request.id,{managerId:request.manager_id},{managerId});
          if (managerId) notify(actor,managerId,name+" has a request that needs your review.",module,request.id);
        }
      }
    }
    run(`UPDATE employees SET name=?,user_id=?,email=?,title=?,department_id=?,manager_id=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      name,linked,email,title,departmentId,managerId,Number(active),id);
  } else {
    id = insert("INSERT INTO employees(company_id,user_id,name,email,title,department_id,manager_id,active) VALUES(?,?,?,?,?,?,?,?)",
      actor.companyId,linked,name,email,title,departmentId,managerId,Number(active));
    const year = Number(today().slice(0,4));
    for (const balanceYear of [year,year+1]) {
      run("INSERT INTO leave_balances(employee_id,type_id,year,remaining) SELECT ?,id,?,entitlement FROM leave_types WHERE company_id=?",id,balanceYear,actor.companyId);
    }
  }
  audit(actor,before?"Updated":"Created","employees",id,before,{name,email,title,departmentId,managerId,active,userId:linked});
  return id;
}

export function updateRole(actor: Actor, command: Extract<Command,{action:"role.update"}>) {
  requirePermission(actor,"users.manage");
  recordForCompany(actor,"users",command.id,"User");
  if (actor.id===command.id) throw new AppError("A second administrator must change your role.",403);
  const previous = required(get<{role_id:string}>("SELECT role_id FROM role_assignments WHERE user_id=?",command.id),"Role assignment").role_id;
  if (previous===command.role) return command.id;
  if (previous==="Manager" && get(`SELECT 1 FROM employees manager JOIN employees member ON member.manager_id=manager.id
    WHERE manager.company_id=? AND manager.user_id=? AND member.company_id=manager.company_id AND
      (member.active=1 OR EXISTS(SELECT 1 FROM leave_requests l WHERE l.employee_id=member.id AND l.status='Pending')
       OR EXISTS(SELECT 1 FROM purchase_requests p WHERE p.employee_id=member.id AND p.status='Pending'))`,actor.companyId,command.id)) {
    throw new AppError("HR must reassign this manager’s reports before changing their role.",409);
  }
  run("UPDATE role_assignments SET role_id=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?",command.role,command.id);
  run("DELETE FROM sessions WHERE user_id=?",command.id);
  audit(actor,"Role changed","users",command.id,{role:previous},{role:command.role});
  return command.id;
}

export function createUser(actor: Actor, command: Extract<Command,{action:"user.create"}>) {
  requirePermission(actor,"users.manage");
  const {name,role,password} = command;
  const email = command.email.toLowerCase();
  if (get("SELECT 1 FROM users WHERE email=?",email)) throw new AppError("That email cannot be used for a new account.",409);
  const id = insert("INSERT INTO users(company_id,email,name,password_hash) VALUES(?,?,?,?)",actor.companyId,email,name,hashPassword(password));
  run("INSERT INTO role_assignments(user_id,role_id) VALUES(?,?)",id,role);
  audit(actor,"Account created","users",id,null,{name,email,role});
  return id;
}

export function saveSettings(actor: Actor, name: string) {
  requirePermission(actor,"settings.manage");
  const before = required(get<Row>("SELECT name FROM companies WHERE id=?",actor.companyId),"Company");
  run("UPDATE companies SET name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",name,actor.companyId);
  audit(actor,"Workspace renamed","settings",actor.companyId,before,{name});
  return actor.companyId;
}
