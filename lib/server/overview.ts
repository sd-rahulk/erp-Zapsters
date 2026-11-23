import { can, docNumber, money, type Actor, type DashboardData, type Metric, type Row } from "@/lib/types";
import { all, get, today } from "./db";
import { employeeScope, orderScope, requestScope } from "./scope";

export function personalBalances(actor: Actor, employeeId=actor.employeeId) {
  return all(`SELECT l.id,l.name,l.entitlement,b.year,b.remaining FROM leave_balances b JOIN leave_types l ON l.id=b.type_id
    WHERE b.employee_id=? AND l.company_id=? ORDER BY b.year,l.id`,employeeId,actor.companyId);
}
const number = (sql: string,...params: (string|number|null)[]) => get<{n:number}>(sql,...params)?.n ?? 0;
const requestSql = (kind:"leave"|"purchasing") => kind==="leave"?"leave_requests":"purchase_requests";
const scopedCount = (actor: Actor,kind:"leave"|"purchasing",where: string) => {
  const scope = requestScope(actor,kind);
  return number(`SELECT count(*) n FROM ${requestSql(kind)} r WHERE r.company_id=? AND ${scope.sql} AND ${where}`,actor.companyId,...scope.params);
};
function metricsFor(actor: Actor): Metric[] {
  const company = actor.companyId;
  if (can(actor,"users.manage")) return [
    {label:"Workspace users",value:number("SELECT count(*) n FROM users WHERE company_id=?",company),note:"Accounts in this company",icon:"users",href:"users"},
    {label:"Assigned roles",value:number("SELECT count(DISTINCT ra.role_id) n FROM role_assignments ra JOIN users u ON u.id=ra.user_id WHERE u.company_id=?",company),note:"Role templates in use",icon:"shield",href:"users"},
    {label:"Audit events",value:number("SELECT count(*) n FROM audit_events WHERE company_id=?",company),note:"Recorded workspace changes",icon:"activity",href:"audit"},
  ];
  if (can(actor,"inventory.manage")) return [
    {label:"Stock items",value:number("SELECT count(*) n FROM products WHERE company_id=?",company),note:"Unique products across warehouses",icon:"boxes",href:"inventory"},
    {label:"Low stock items",value:number(`SELECT count(*) n FROM products p WHERE p.company_id=? AND p.reorder_point>=(SELECT COALESCE(SUM(l.quantity),0) FROM stock_levels l WHERE l.product_id=p.id)`,company),note:"At or below reorder point",icon:"alert",href:"inventory"},
    {label:"Incoming orders",value:number("SELECT count(*) n FROM purchase_orders WHERE company_id=? AND status!='Received'",company),note:"Orders with goods outstanding",icon:"cart",href:"orders"},
    {label:"Goods receipts",value:number("SELECT count(*) n FROM goods_receipts WHERE company_id=?",company),note:"Deliveries recorded to date",icon:"clipboard",href:"orders"},
  ];
  if (can(actor,"invoices.manage")) return [
    {label:"Open receivables",value:money(number("SELECT COALESCE(sum(total_minor),0) n FROM invoices WHERE company_id=? AND kind='Receivable' AND status='Open'",company),actor.currency),note:"Outstanding customer invoices",icon:"wallet",href:"invoices"},
    {label:"Open payables",value:money(number("SELECT COALESCE(sum(total_minor),0) n FROM invoices WHERE company_id=? AND kind='Payable' AND status='Open'",company),actor.currency),note:"Outstanding supplier invoices",icon:"cart",href:"invoices"},
    {label:"Recorded payments",value:number("SELECT count(*) n FROM payments p JOIN invoices i ON i.id=p.invoice_id WHERE i.company_id=?",company),note:"Invoices settled in full",icon:"clipboard",href:"invoices"},
    {label:"Incoming orders",value:number("SELECT count(*) n FROM purchase_orders WHERE company_id=? AND status!='Received'",company),note:"Orders with goods outstanding",icon:"boxes",href:"orders"},
  ];
  if (can(actor,"leave.decide") || can(actor,"employees.manage")) {
    const scope = employeeScope(actor);
    const headcount = number(`SELECT count(*) n FROM employees e WHERE e.company_id=? AND ${scope.sql} AND e.active=1`,company,...scope.params);
    const activeLeave = number(`SELECT count(*) n FROM employees e WHERE e.company_id=? AND ${scope.sql} AND e.active=1 AND EXISTS(
      SELECT 1 FROM leave_requests r WHERE r.employee_id=e.id AND r.status='Approved' AND date('now') BETWEEN r.start_date AND r.end_date
      AND strftime('%w','now') NOT IN ('0','6'))`,company,...scope.params);
    const hr = can(actor,"employees.manage");
    return [
      {label:hr?"Active employees":"Active team",value:headcount,note:hr?"Across all departments":"You and your direct reports",icon:"users",href:"employees"},
      {label:"Pending leave",value:scopedCount(actor,"leave","r.status='Pending'"),note:hr?"Across the company":"Requests awaiting a manager",icon:"calendar",href:"leave"},
      hr ? {label:"Leave approvals",value:scopedCount(actor,"leave","r.status='Approved'"),note:"Approved requests on record",icon:"clipboard",href:"leave"}
        : {label:"Pending purchases",value:scopedCount(actor,"purchasing","r.status='Pending'"),note:"Requests awaiting a manager",icon:"cart",href:"purchasing"},
      {label:"On leave today",value:activeLeave,note:"Based on approved leave dates",icon:"activity",href:"employees"},
    ];
  }
  const annual = personalBalances(actor).find(row=>row.name==="Annual leave" && Number(row.year)===Number(today().slice(0,4)));
  return [
    {label:"Annual leave balance",value:annual?.remaining ?? 0,note:"Working days remaining this year",icon:"calendar",href:"leave"},
    {label:"Pending leave",value:scopedCount(actor,"leave","r.status='Pending'"),note:"Requests awaiting your manager",icon:"clipboard",href:"leave"},
    {label:"Purchase requests",value:scopedCount(actor,"purchasing","r.status='Pending'"),note:"Requests awaiting your manager",icon:"cart",href:"purchasing"},
  ];
}
export function reportRows(actor: Actor): Row[] {
  return metricsFor(actor).map((metric,index)=>({id:index+1,name:metric.label,value:metric.value,note:metric.note,module:metric.href}));
}
function pendingQueue(actor: Actor): Row[] {
  const company = actor.companyId;
  if (can(actor,"orders.receive")) {
    const scope = orderScope(actor);
    return all(`SELECT o.id,s.name AS name,'Goods receipt' AS type,'orders' AS module,o.created_at,o.status FROM purchase_orders o
      JOIN suppliers s ON s.id=o.supplier_id WHERE o.company_id=? AND ${scope.sql} AND o.status!='Received' ORDER BY o.id DESC LIMIT 5`,company,...scope.params);
  }
  if (can(actor,"invoices.manage")) return all(`SELECT i.id,COALESCE(c.name,s.name) AS name,i.kind AS type,'invoices' AS module,i.due_date AS created_at,
    CASE WHEN i.due_date<date('now') THEN 'Overdue' ELSE i.status END AS status
    FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id LEFT JOIN suppliers s ON s.id=i.supplier_id
    WHERE i.company_id=? AND i.status='Open' ORDER BY i.due_date LIMIT 5`,company);
  if (can(actor,"users.manage")) return all(`SELECT a.id,u.name,a.action AS type,'audit' AS module,a.created_at,a.entity AS status
    FROM audit_events a JOIN users u ON u.id=a.actor_id WHERE a.company_id=? ORDER BY a.id DESC LIMIT 5`,company);
  const leave = requestScope(actor,"leave");
  const purchase = requestScope(actor,"purchasing");
  const onlyReports = can(actor,"leave.decide") ? " AND r.employee_id IS NOT ?" : "";
  const reports = onlyReports ? [actor.employeeId] : [];
  return all(`SELECT * FROM (
    SELECT r.id,e.name,t.name AS type,'leave' AS module,r.created_at,r.status FROM leave_requests r
      JOIN employees e ON e.id=r.employee_id JOIN leave_types t ON t.id=r.type_id
      WHERE r.company_id=? AND ${leave.sql} AND r.status='Pending'${onlyReports}
    UNION ALL
    SELECT r.id,e.name,'Purchase request' AS type,'purchasing' AS module,r.created_at,r.status FROM purchase_requests r
      JOIN employees e ON e.id=r.employee_id WHERE r.company_id=? AND ${purchase.sql} AND r.status='Pending'${onlyReports}
    ) ORDER BY created_at DESC,id DESC LIMIT 5`,company,...leave.params,...reports,company,...purchase.params,...reports);
}

export function dashboard(actor: Actor): DashboardData {
  const tasks = pendingQueue(actor).map(row=>({...row,reference:docNumber(
    row.module==="leave"?"LV":row.module==="purchasing"?"PR":row.module==="orders"?"PO":row.module==="invoices"?"INV":"EV",row.id)}));
  const updates = all(`SELECT n.id,n.message,n.created_at,n.read_at FROM notifications n
    WHERE n.company_id=? AND n.user_id=? ORDER BY n.id DESC LIMIT 4`,actor.companyId,actor.id);
  const chart: DashboardData["chart"] = [];
  if (can(actor,"leave.read")) {
    const leave = requestScope(actor,"leave");
    const purchasing = requestScope(actor,"purchasing");
    const start = new Date(today()+"T00:00:00Z");
    start.setUTCDate(start.getUTCDate()-((start.getUTCDay()+6)%7)-21);
    for (let week=0;week<4;week++) {
      const from=start.toISOString().slice(0,10);
      const label=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",timeZone:"UTC"}).format(start);
      start.setUTCDate(start.getUTCDate()+7);
      const to=start.toISOString().slice(0,10);
      chart.push({
        label,leave:number(`SELECT count(*) n FROM leave_requests r WHERE r.company_id=? AND ${leave.sql} AND r.created_at>=? AND r.created_at<?`,actor.companyId,...leave.params,from,to),
        purchase:number(`SELECT count(*) n FROM purchase_requests r WHERE r.company_id=? AND ${purchasing.sql} AND r.created_at>=? AND r.created_at<?`,actor.companyId,...purchasing.params,from,to),
      });
    }
  }
  return {metrics:metricsFor(actor),queue:tasks,updates,chart};
}
