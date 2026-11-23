import { can, type Actor, type Dataset, type Module, type Row } from "@/lib/types";
import { all } from "./db";
import { personalBalances } from "./overview";

export function buildDetail(actor: Actor,module: Module,record: Row): NonNullable<Dataset["detail"]> {
  const id = Number(record.id);
  let lines: Row[] = [];
  let related: Row[] = [];
  const actions: string[] = [];
  switch (module) {
    case "employees":
      lines = personalBalances(actor,id);
      if (can(actor,"employees.manage")) actions.push("employee.save");
      break;
    case "leave":
      if (can(actor,"leave.decide") && record.manager_id===actor.employeeId && record.employee_id!==actor.employeeId && record.status==="Pending") actions.push("leave.decide");
      break;
    case "purchasing":
      lines = all(`SELECT p.name,p.sku,l.quantity,l.unit_cost_minor,l.quantity*l.unit_cost_minor AS total_minor
        FROM purchase_request_lines l JOIN products p ON p.id=l.product_id WHERE l.request_id=? ORDER BY l.id`,id);
      if (record.status==="Pending" && can(actor,"purchasing.decide") && record.manager_id===actor.employeeId && record.employee_id!==actor.employeeId) actions.push("purchase.decide");
      if (record.status==="Approved" && can(actor,"orders.create") && record.employee_id!==actor.employeeId) actions.push("order.create");
      if (record.order_id) related = all(`SELECT r.id,w.name AS warehouse,u.name AS actor,r.note,r.created_at,
        (SELECT SUM(l.quantity) FROM goods_receipt_lines l WHERE l.receipt_id=r.id) AS quantity
        FROM goods_receipts r JOIN warehouses w ON w.id=r.warehouse_id JOIN users u ON u.id=r.actor_id
        WHERE r.company_id=? AND r.order_id=? ORDER BY r.id DESC`,actor.companyId,record.order_id);
      break;
    case "orders":
      lines = all(`SELECT l.id,p.name,p.sku,l.quantity,l.unit_cost_minor,l.quantity*l.unit_cost_minor AS total_minor,
        COALESCE(SUM(g.quantity),0) AS received FROM purchase_order_lines l JOIN products p ON p.id=l.product_id
        LEFT JOIN goods_receipt_lines g ON g.order_line_id=l.id WHERE l.order_id=? GROUP BY l.id ORDER BY l.id`,id);
      related = all(`SELECT r.id,w.name AS warehouse,u.name AS actor,r.note,r.created_at,p.name AS item,p.sku,l.quantity
        FROM goods_receipts r JOIN warehouses w ON w.id=r.warehouse_id JOIN users u ON u.id=r.actor_id
        JOIN goods_receipt_lines l ON l.receipt_id=r.id JOIN purchase_order_lines ol ON ol.id=l.order_line_id
        JOIN products p ON p.id=ol.product_id WHERE r.company_id=? AND r.order_id=? ORDER BY r.id DESC,l.order_line_id`,actor.companyId,id);
      if (can(actor,"orders.receive") && ["Ordered","Partially Received"].includes(String(record.status))) actions.push("order.receive");
      break;
    case "inventory":
      lines = all(`SELECT w.name,COALESCE(l.quantity,0) AS quantity FROM warehouses w LEFT JOIN stock_levels l ON l.warehouse_id=w.id
        AND l.product_id=? WHERE w.company_id=? ORDER BY w.name`,id,actor.companyId);
      related = all(`SELECT m.id,m.kind,m.delta,m.note,w.name AS warehouse,m.created_at FROM stock_movements m JOIN warehouses w ON w.id=m.warehouse_id
        WHERE m.company_id=? AND m.product_id=? ORDER BY m.id DESC LIMIT 10`,actor.companyId,id);
      actions.push("product.save","stock.adjust");
      break;
    case "suppliers":
      if (can(actor,"suppliers.manage")) actions.push("supplier.save");
      break;
    case "sales":
      lines = all(`SELECT p.name,p.sku,l.quantity,l.unit_price_minor,l.quantity*l.unit_price_minor AS total_minor
        FROM sales_order_lines l JOIN products p ON p.id=l.product_id WHERE l.order_id=? ORDER BY p.name`,id);
      related = all(`SELECT m.id,m.kind,m.delta,m.note,w.name AS warehouse,m.created_at,p.name AS item
        FROM stock_movements m JOIN warehouses w ON w.id=m.warehouse_id JOIN products p ON p.id=m.product_id
        WHERE m.company_id=? AND m.sales_order_id=? ORDER BY m.id DESC`,actor.companyId,id);
      break;
    case "notifications":
      if (record.status==="Unread") actions.push("notifications.read");
      break;
    case "invoices":
      if (record.sales_order_id) lines = all(`SELECT p.name,p.sku,l.quantity,l.unit_price_minor,l.quantity*l.unit_price_minor AS total_minor
        FROM sales_order_lines l JOIN products p ON p.id=l.product_id WHERE l.order_id=? ORDER BY p.name`,record.sales_order_id);
      related = all(`SELECT p.id,p.amount_minor,p.reference,p.created_at,u.name AS actor FROM payments p JOIN users u ON u.id=p.actor_id WHERE p.invoice_id=?`,id);
      if (record.status==="Open") actions.push("invoice.update");
      break;
    case "users":
      if (actor.id!==id) actions.push("role.update");
      break;
  }
  const history = ["audit","notifications","movements"].includes(module) ? [] : all(`SELECT a.id,a.action,a.created_at,u.name AS actor,
    json_extract(a.before_json,'$.status') AS before_status,json_extract(a.after_json,'$.status') AS after_status,
    json_extract(a.after_json,'$.reason') AS reason
    FROM audit_events a JOIN users u ON u.id=a.actor_id
    WHERE a.company_id=? AND a.entity=? AND a.entity_id=? ORDER BY a.id DESC LIMIT 25`,actor.companyId,module,id);
  return {record,lines,related,history,actions};
}
