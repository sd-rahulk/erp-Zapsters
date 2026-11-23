import { can, docNumber, type Actor } from "@/lib/types";
import type { Command } from "./validation";
import { requirePermission } from "./auth";
import { all, AppError, audit, get, insert, notify, required, run } from "./db";
import { approver, recordForCompany, requester } from "./workflow";
import { requestScope } from "./scope";
import { moveStock } from "./stock";

type Request = {id:number; employee_id:number; manager_id:number; supplier_id:number|null; status:string; currency:string};
type Line = {id:number; product_id:number; quantity:number; received:number};
const request = (actor: Actor, id: number) => required(get<Request>(
  "SELECT * FROM purchase_requests WHERE company_id=? AND id=?",actor.companyId,id),"Purchase request");

export function submitPurchase(actor: Actor, command: Extract<Command,{action:"purchase.submit"}>) {
  requirePermission(actor,"purchasing.submit");
  const employee = requester(actor,"purchasing.decide");
  const key = actor.id+":"+command.operation;
  const existing = get<{id:number}>("SELECT id FROM purchase_requests WHERE company_id=? AND employee_id=? AND operation_key=?",actor.companyId,employee.id,key);
  if (existing) return existing.id;
  if (command.supplierId) recordForCompany(actor,"suppliers",command.supplierId,"Supplier");
  const lines = command.lines.map(({productId,quantity})=>({
    productId,quantity,cost:recordForCompany<{unit_cost_minor:number}>(actor,"products",productId,"Stock item").unit_cost_minor,
  }));
  const id = insert(`INSERT INTO purchase_requests(company_id,employee_id,manager_id,supplier_id,reason,currency,status,operation_key)
    VALUES(?,?,?,?,?,?,'Pending',?)`,actor.companyId,employee.id,employee.manager_id,command.supplierId,command.reason,actor.currency,key);
  for (const line of lines) run("INSERT INTO purchase_request_lines(request_id,product_id,quantity,unit_cost_minor) VALUES(?,?,?,?)",
    id,line.productId,line.quantity,line.cost);
  audit(actor,"Submitted","purchasing",id,null,{status:"Pending",supplierId:command.supplierId,lines});
  notify(actor,employee.manager_id,employee.name+" submitted "+docNumber("PR",id)+".","purchasing",id);
  return id;
}

export function decidePurchase(actor: Actor, command: Extract<Command,{action:"purchase.decide"}>) {
  requirePermission(actor,"purchasing.decide");
  const document = request(actor,command.id);
  const reason = approver(actor,document,command);
  run(`UPDATE purchase_requests SET status=?,decided_by=?,decided_at=CURRENT_TIMESTAMP,decision_reason=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=?`,command.outcome,actor.id,reason,document.id);
  audit(actor,command.outcome,"purchasing",document.id,{status:document.status},{status:command.outcome,reason});
  notify(actor,document.employee_id,docNumber("PR",document.id)+" was "+command.outcome.toLowerCase()+".","purchasing",document.id);
  return document.id;
}

export function issueOrder(actor: Actor, command: Extract<Command,{action:"order.create"}>) {
  requirePermission(actor,"orders.create");
  const document = request(actor,command.id);
  const scope = requestScope(actor,"purchasing");
  if ((!can(actor,"orders.read") && !get(`SELECT 1 FROM purchase_requests r WHERE r.id=? AND r.company_id=? AND ${scope.sql}`,document.id,actor.companyId,...scope.params))
      || document.employee_id===actor.employeeId) {
    throw new AppError("You can issue orders for approved requests in your scope submitted by someone else.",403);
  }
  if (document.status!=="Approved") throw new AppError("Only an approved request can become a purchase order.",409);
  const supplierId = document.supplier_id ?? command.supplierId;
  if (!supplierId) throw new AppError("Choose a supplier before issuing the order.");
  recordForCompany(actor,"suppliers",supplierId,"Supplier");
  const id = insert(`INSERT INTO purchase_orders(company_id,request_id,supplier_id,currency,status,created_by) VALUES(?,?,?,?,'Ordered',?)`,
    actor.companyId,document.id,supplierId,document.currency,actor.id);
  run(`INSERT INTO purchase_order_lines(order_id,product_id,quantity,unit_cost_minor)
    SELECT ?,product_id,quantity,unit_cost_minor FROM purchase_request_lines WHERE request_id=?`,id,document.id);
  run("UPDATE purchase_requests SET status='Ordered',supplier_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",supplierId,document.id);
  const after = {status:"Ordered",orderId:id,supplierId};
  audit(actor,"Purchase order issued","purchasing",document.id,{status:document.status,supplierId:document.supplier_id},after);
  audit(actor,"Created","orders",id,null,{...after,requestId:document.id});
  notify(actor,document.employee_id,docNumber("PO",id)+" was issued for your request.","purchasing",document.id);
  return id;
}

export function receiveOrder(actor: Actor, command: Extract<Command,{action:"order.receive"}>) {
  requirePermission(actor,"orders.receive");
  const order = required(get<{id:number; request_id:number; status:string}>(
    "SELECT id,request_id,status FROM purchase_orders WHERE company_id=? AND id=?",actor.companyId,command.id),"Purchase order");
  const key = actor.id+":"+command.operation;
  const existing = get<{id:number; order_id:number}>("SELECT id,order_id FROM goods_receipts WHERE company_id=? AND operation_key=?",actor.companyId,key);
  if (existing) {
    if (existing.order_id!==order.id) throw new AppError("The receipt operation was already used for another order.",409);
    return existing.id;
  }
  if (!["Ordered","Partially Received"].includes(order.status)) throw new AppError("This order has already been received.",409);
  recordForCompany(actor,"warehouses",command.warehouseId,"Warehouse");
  const lines = all<Line>(`SELECT l.id,l.product_id,l.quantity,COALESCE(SUM(g.quantity),0) AS received
    FROM purchase_order_lines l LEFT JOIN goods_receipt_lines g ON g.order_line_id=l.id WHERE l.order_id=? GROUP BY l.id`,order.id);
  const receiptLines = new Map(command.lines.map(line=>[line.lineId,line.quantity]));
  for (const line of command.lines) {
    const ordered = lines.find(item=>item.id===line.lineId);
    if (!ordered || line.quantity>ordered.quantity-ordered.received) {
      throw new AppError("A receipt line exceeds the outstanding quantity or does not belong to the order.",409);
    }
  }
  const note = command.note || "Delivery recorded for "+docNumber("PO",order.id);
  const receiptId = insert(`INSERT INTO goods_receipts(company_id,order_id,warehouse_id,actor_id,note,operation_key)
    VALUES(?,?,?,?,?,?)`,actor.companyId,order.id,command.warehouseId,actor.id,note,key);
  for (const line of lines) {
    const quantity = receiptLines.get(line.id);
    if (!quantity) continue;
    run("INSERT INTO goods_receipt_lines VALUES(?,?,?)",receiptId,line.id,quantity);
    moveStock(actor,{productId:line.product_id,warehouseId:command.warehouseId,delta:quantity,kind:"Receipt",note,receiptId});
  }
  const status = lines.every(line=>line.received+(receiptLines.get(line.id)??0)===line.quantity) ? "Received" : "Partially Received";
  run("UPDATE purchase_orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",status,order.id);
  run("UPDATE purchase_requests SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",status,order.request_id);
  const after = {status,receiptId,warehouseId:command.warehouseId,lines:command.lines};
  audit(actor,"Goods received","purchasing",order.request_id,{status:order.status},after);
  audit(actor,"Goods received","orders",order.id,{status:order.status},after);
  const source = request(actor,order.request_id);
  notify(actor,source.employee_id,docNumber("PO",order.id)+(status==="Received"?" was received in full.":" was partially received."),"purchasing",source.id);
  return receiptId;
}
