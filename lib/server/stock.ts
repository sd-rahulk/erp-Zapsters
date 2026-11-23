import type { Actor, Row } from "@/lib/types";
import type { Command } from "./validation";
import { requirePermission } from "./auth";
import { AppError, audit, get, insert, run } from "./db";
import { recordForCompany } from "./workflow";

export function moveStock(actor: Actor, change: {productId:number; warehouseId:number; delta:number; kind:"Receipt"|"Adjustment"; note:string; receiptId?:number; key?:string}) {
  recordForCompany(actor,"products",change.productId,"Stock item");
  recordForCompany(actor,"warehouses",change.warehouseId,"Warehouse");
  const quantity = get<{quantity:number}>("SELECT quantity FROM stock_levels WHERE warehouse_id=? AND product_id=?",change.warehouseId,change.productId)?.quantity ?? 0;
  const next = quantity+change.delta;
  if (next<0) throw new AppError("This movement would make stock negative in the selected warehouse.",409);
  run(`INSERT INTO stock_levels(warehouse_id,product_id,quantity) VALUES(?,?,?)
    ON CONFLICT(warehouse_id,product_id) DO UPDATE SET quantity=excluded.quantity,updated_at=CURRENT_TIMESTAMP`,
    change.warehouseId,change.productId,next);
  const id = insert(`INSERT INTO stock_movements(company_id,warehouse_id,product_id,actor_id,receipt_id,operation_key,kind,delta,note)
    VALUES(?,?,?,?,?,?,?,?,?)`,actor.companyId,change.warehouseId,change.productId,actor.id,change.receiptId??null,change.key??null,
    change.kind,change.delta,change.note);
  audit(actor,change.kind,"movements",id,{quantity},{quantity:next,...change});
  return id;
}
export function adjustStock(actor: Actor, command: Extract<Command,{action:"stock.adjust"}>) {
  requirePermission(actor,"inventory.manage");
  const key = actor.id+":"+command.operation;
  const existing = get<{id:number}>("SELECT id FROM stock_movements WHERE company_id=? AND operation_key=?",actor.companyId,key);
  if (existing) return existing.id;
  return moveStock(actor,{...command,key,kind:"Adjustment"});
}
export function saveProduct(actor: Actor, command: Extract<Command,{action:"product.save"}>) {
  requirePermission(actor,"inventory.manage");
  const sku = command.sku.toUpperCase();
  const existing = get<{id:number}>("SELECT id FROM products WHERE company_id=? AND sku=?",actor.companyId,sku);
  if (existing && existing.id!==command.id) throw new AppError("That SKU is already in use.",409);
  const [whole,fraction=""] = command.cost.split(".");
  const cost = Number(whole)*100+Number(fraction.padEnd(2,"0"));
  const before = command.id ? recordForCompany<Row>(actor,"products",command.id,"Stock item") : null;
  const {name,category,reorder} = command;
  let id = command.id;
  if (id) run("UPDATE products SET sku=?,name=?,category=?,unit_cost_minor=?,reorder_point=? WHERE id=?",sku,name,category,cost,reorder,id);
  else id = insert("INSERT INTO products(company_id,sku,name,category,unit_cost_minor,reorder_point) VALUES(?,?,?,?,?,?)",actor.companyId,sku,name,category,cost,reorder);
  audit(actor,before?"Updated":"Created","inventory",id,before,{sku,name,category,unit_cost_minor:cost,reorder_point:reorder});
  return id;
}
