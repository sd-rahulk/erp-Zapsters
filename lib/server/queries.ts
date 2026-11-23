import { can, canOpen, docNumber, pageSize, type Actor, type Dataset, type Module, type Option, type Row } from "@/lib/types";
import { requireModule } from "./auth";
import { all, get, AppError } from "./db";
import { employeeScope, orderScope, requestScope } from "./scope";
import { buildDetail } from "./detail";
import { reportRows, personalBalances } from "./overview";

const employees = `SELECT e.id,e.name,e.email,e.title,e.active,d.name AS department,m.name AS manager,e.manager_id,e.department_id,e.created_at,
  CASE WHEN e.active=0 THEN 'Inactive' WHEN EXISTS(SELECT 1 FROM leave_requests l WHERE l.company_id=e.company_id AND l.employee_id=e.id
    AND l.status='Approved' AND date('now') BETWEEN l.start_date AND l.end_date AND strftime('%w','now') NOT IN ('0','6'))
    THEN 'On leave' ELSE 'Active' END AS status
  FROM employees e JOIN departments d ON d.id=e.department_id AND d.company_id=e.company_id
  LEFT JOIN employees m ON m.id=e.manager_id AND m.company_id=e.company_id`;
const leave = `SELECT r.id,e.name,t.name AS type,r.employee_id,r.manager_id,m.name AS manager,r.days,r.start_date,r.end_date,
  r.reason,r.status,r.decision_reason,u.name AS approver,r.decided_at,r.created_at
  FROM leave_requests r JOIN employees e ON e.id=r.employee_id JOIN employees m ON m.id=r.manager_id
  JOIN leave_types t ON t.id=r.type_id LEFT JOIN users u ON u.id=r.decided_by`;
const purchase = `SELECT r.id,e.name,r.employee_id,r.manager_id,m.name AS manager,r.supplier_id,s.name AS supplier,r.reason,r.currency,r.status,
  r.decision_reason,u.name AS approver,r.decided_at,r.created_at,o.id AS order_id,
  (SELECT COALESCE(SUM(l.quantity*l.unit_cost_minor),0) FROM purchase_request_lines l WHERE l.request_id=r.id) AS total_minor
  FROM purchase_requests r JOIN employees e ON e.id=r.employee_id JOIN employees m ON m.id=r.manager_id
  LEFT JOIN suppliers s ON s.id=r.supplier_id LEFT JOIN users u ON u.id=r.decided_by LEFT JOIN purchase_orders o ON o.request_id=r.id`;
const orders = `SELECT o.id,'PO-'||printf('%04d',o.id) AS name,o.request_id,s.name AS supplier,o.currency,o.status,o.created_at,u.name AS issuer,
  (SELECT COALESCE(SUM(quantity*unit_cost_minor),0) FROM purchase_order_lines WHERE order_id=o.id) AS total_minor
  FROM purchase_orders o JOIN suppliers s ON s.id=o.supplier_id JOIN users u ON u.id=o.created_by`;
const stock = `SELECT p.*,COALESCE(SUM(l.quantity),0) AS quantity,
  CASE WHEN COALESCE(SUM(l.quantity),0)<=p.reorder_point THEN 'Low stock' ELSE 'In stock' END AS status
  FROM products p LEFT JOIN stock_levels l ON l.product_id=p.id WHERE p.company_id=? GROUP BY p.id`;
const invoices = `SELECT i.*,'INV-'||printf('%04d',i.id) AS reference,COALESCE(c.name,s.name) AS name,
  CASE WHEN i.status='Open' AND i.due_date<date('now') THEN 'Overdue' ELSE i.status END AS display_status
  FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id LEFT JOIN suppliers s ON s.id=i.supplier_id`;
const sales = `SELECT o.*,c.name,i.id AS invoice_id,'SO-'||printf('%04d',o.id) AS reference,
  (SELECT COALESCE(SUM(l.quantity*l.unit_price_minor),0) FROM sales_order_lines l WHERE l.order_id=o.id) AS total_minor
  FROM sales_orders o JOIN customers c ON c.id=o.customer_id LEFT JOIN invoices i ON i.sales_order_id=o.id`;
const audits = `SELECT a.id,u.name,a.action,a.entity,a.entity_id,a.created_at,
  CASE WHEN a.entity IN ('settings','users') THEN a.before_json ELSE json_extract(a.before_json,'$.status') END AS before_value,
  CASE WHEN a.entity IN ('settings','users') THEN a.after_json ELSE json_extract(a.after_json,'$.status') END AS after_value
  FROM audit_events a JOIN users u ON u.id=a.actor_id`;
const movements = `SELECT m.*,p.name,p.sku,w.name AS warehouse,u.name AS actor,r.order_id
  FROM stock_movements m JOIN products p ON p.id=m.product_id JOIN warehouses w ON w.id=m.warehouse_id
  JOIN users u ON u.id=m.actor_id LEFT JOIN goods_receipts r ON r.id=m.receipt_id`;
const notification = `SELECT *,message AS name,CASE WHEN read_at IS NULL THEN 'Unread' ELSE 'Read' END AS status FROM notifications`;
const userList = `SELECT u.id,u.name,u.email,r.role_id AS role,u.created_at,r.updated_at FROM users u JOIN role_assignments r ON r.user_id=u.id`;

type Listing = {sql:string;params:(number|string|null)[]; search:string[]; status?:string; order?:string};
function listing(actor: Actor,module: Module): Listing {
  const company = actor.companyId;
  switch(module) {
    case "employees": {
      const scope = employeeScope(actor);
      return {sql:employees+" WHERE e.company_id=? AND "+scope.sql,params:[company,...scope.params],search:["name","department","title","email"],status:"status",order:"name"};
    }
    case "leave": {
      const scope = requestScope(actor,"leave");
      return {sql:leave+" WHERE r.company_id=? AND "+scope.sql,params:[company,...scope.params],search:["name","type","'LV-'||printf('%04d',id)"],status:"status"};
    }
    case "purchasing": {
      const scope = requestScope(actor,"purchasing");
      return {sql:purchase+" WHERE r.company_id=? AND "+scope.sql,params:[company,...scope.params],search:["name","supplier","reason","'PR-'||printf('%04d',id)"],status:"status"};
    }
    case "orders": {
      const scope = orderScope(actor);
      return {sql:orders+" WHERE o.company_id=? AND "+scope.sql,params:[company,...scope.params],search:["name","supplier"],status:"status"};
    }
    case "inventory": return {sql:stock,params:[company],search:["name","sku","category"],status:"status",order:"name"};
    case "movements": return {sql:movements+" WHERE m.company_id=?",params:[company],search:["name","sku","warehouse","note"],status:"kind"};
    case "suppliers": return {sql:"SELECT * FROM suppliers WHERE company_id=?",params:[company],search:["name","email","category"],order:"name"};
    case "invoices": return {sql:invoices+" WHERE i.company_id=?",params:[company],search:["name","kind","reference"],status:"display_status"};
    case "sales": return {sql:sales+" WHERE o.company_id=?",params:[company],search:["name","reference"],status:"status"};
    case "users": return {sql:userList+" WHERE u.company_id=?",params:[company],search:["name","email"],status:"role",order:"name"};
    case "audit": return {sql:audits+" WHERE a.company_id=?",params:[company],search:["name","action","entity"],status:"entity"};
    case "notifications": return {sql:notification+" WHERE company_id=? AND user_id=?",params:[company,actor.id],search:["message"],status:"status"};
    default: throw new AppError("This module does not have a record list.",404);
  }
}

export function scopeRecord(actor: Actor,module: Module,id: number) {
  requireModule(actor,module);
  const config = listing(actor,module);
  return get(`SELECT * FROM (${config.sql}) records WHERE id=?`,...config.params,id);
}
function withRelatedTarget(actor: Actor,row: Row): Row {
  const target = row.module;
  const allowed = (target==="leave" || target==="purchasing" || target==="orders") &&
    canOpen(actor,target) && !!scopeRecord(actor,target,Number(row.entity_id));
  return {...row,can_open:Number(allowed)};
}
export function unreadCount(actor: Actor) {
  return get<{n:number}>("SELECT count(*) n FROM notifications WHERE company_id=? AND user_id=? AND read_at IS NULL",actor.companyId,actor.id)?.n ?? 0;
}

export function getDataset(actor: Actor,module: Module,params: {q?: string;status?: string; sort?: string;page?: number; id?: number}): Dataset {
  requireModule(actor,module);
  const options: Dataset["options"] = {};
  const company = actor.companyId;
  const optionsFor = (table: "suppliers"|"warehouses"|"departments"|"products"|"leave_types") =>
    all<Option>(`SELECT id,name FROM ${table} WHERE company_id=? ORDER BY name`,company);
  if (module==="settings") return {rows:[{id:company,name:actor.company,currency:actor.currency}],total:1,page:1,options};
  if (module==="reports") {
    const rows = reportRows(actor);
    return {rows,total:rows.length,page:1,options};
  }
  if (module==="leave" && actor.employeeId) {
    options.types = optionsFor("leave_types");
    options.balances = personalBalances(actor).filter(row=>String(row.year)===new Date().getUTCFullYear().toString())
      .map(row=>({id:Number(row.id),name:`${row.name} · ${row.remaining} days available`}));
  }
  if (module==="purchasing" || (module==="orders" && can(actor,"orders.create"))) options.suppliers = optionsFor("suppliers");
  if (module==="purchasing" && can(actor,"purchasing.submit")) options.products = optionsFor("products");
  if (["orders","inventory","movements"].includes(module) && can(actor,"inventory.manage")) {
    options.warehouses = optionsFor("warehouses");
    options.products = optionsFor("products");
  }
  if (module==="employees" && can(actor,"employees.manage")) {
    options.departments = optionsFor("departments");
    options.managers = all<Option>(`SELECT e.id,e.name FROM employees e JOIN role_assignments r ON r.user_id=e.user_id WHERE
      e.company_id=? AND e.active=1 AND r.role_id='Manager' ORDER BY e.name`,company);
  }
  if (module==="orders" && can(actor,"orders.create")) {
    const scope = can(actor,"orders.read") ? {sql:"1=1",params:[]} : requestScope(actor,"purchasing");
    options.approved = all<{id:number;name:string;supplier:string|null}>(`SELECT r.id,e.name,s.name AS supplier
      FROM purchase_requests r JOIN employees e ON e.id=r.employee_id LEFT JOIN suppliers s ON s.id=r.supplier_id
      WHERE r.company_id=? AND r.status='Approved' AND r.employee_id IS NOT ? AND ${scope.sql} ORDER BY r.id DESC`,
      company,actor.employeeId,...scope.params).map(row=>({id:row.id,name:docNumber("PR",row.id)+" · "+row.name+(row.supplier?" · "+row.supplier:"")}));
  }
  if (module==="users") {
    options.roles = all<Option>("SELECT id,label AS name FROM roles ORDER BY label");
    options.permissions = all<Option>("SELECT role_id AS id,group_concat(permission_id,', ') AS name FROM (SELECT * FROM role_permissions ORDER BY permission_id) GROUP BY role_id");
  }
  const config = listing(actor,module);
  const conditions: string[] = [];
  const values = [...config.params];
  if (config.status) {
    options.statuses = all<Option>(`SELECT DISTINCT ${config.status} id,${config.status} name FROM (${config.sql}) ORDER BY name`,...config.params);
    if (params.status) {
      conditions.push(config.status+"=?");
      values.push(params.status);
    }
  }
  if (params.q) {
    conditions.push("("+config.search.map(field=>`instr(lower(COALESCE(${field},'')),lower(?))>0`).join(" OR ")+")");
    values.push(...config.search.map(()=>params.q!.slice(0,100)));
  }
  const source = " FROM ("+config.sql+") records"+(conditions.length?" WHERE "+conditions.join(" AND "):"");
  const total = get<{n:number}>("SELECT count(*) n"+source,...values)?.n ?? 0;
  const page = Math.max(1,Math.min(params.page||1,Math.ceil(total/pageSize)));
  const sort = params.sort==="oldest" ? "created_at ASC,id ASC" : params.sort==="name" ? "name COLLATE NOCASE ASC,id ASC"
    : params.sort!=="recent" && config.order ? config.order+" COLLATE NOCASE,id" : "created_at DESC,id DESC";
  const rows = all("SELECT *"+source+" ORDER BY "+sort+" LIMIT ? OFFSET ?",...values,pageSize,(page-1)*pageSize);
  const dataset: Dataset = {rows,total,page,options};
  if (params.id) {
    const record = scopeRecord(actor,module,params.id);
    if (!record) throw new AppError("This record is unavailable in your workspace.",404);
    dataset.detail = buildDetail(actor,module,module==="notifications"?withRelatedTarget(actor,record):record);
  }
  return dataset;
}
