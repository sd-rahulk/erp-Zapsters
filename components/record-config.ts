import { dateLabel, docNumber, money, prettyTime, type Module, type Row, type Scalar } from "@/lib/types";
type Column = {label:string;key:string;format?:"date"|"time"|"money"|"status"|"delta"|"id";prefix?:string};
const column=(label: string,key: string,format?:Column["format"],prefix?:string):Column=>({label,key,format,prefix});
const name=column("Name","name");
const status=column("Status","status","status");
const created=column("Created","created_at","date");
const moneyColumn=column("Total","total_minor","money");
export const columns: Partial<Record<Module,Column[]>> = {
  employees:[name,column("Job title","title"),column("Department","department"),column("Manager","manager"),status],
  leave:[column("Request","id","id","LV"),column("Employee","name"),column("Leave type","type"),column("Starts","start_date","date"),column("Ends","end_date","date"),column("Days","days"),status],
  purchasing:[column("Request","id","id","PR"),column("Requester","name"),column("Supplier","supplier"),moneyColumn,status,created],
  orders:[column("Order","name"),column("Supplier","supplier"),column("Request","request_id","id","PR"),moneyColumn,status,created],
  inventory:[column("Item","name"),column("SKU","sku"),column("Category","category"),column("On hand","quantity"),column("Reorder at","reorder_point"),status],
  movements:[column("Item","name"),column("Movement","kind"),column("Warehouse","warehouse"),column("Quantity","delta","delta"),column("Recorded by","actor"),created],
  suppliers:[column("Supplier","name"),column("Category","category"),column("Email","email"),created],
  sales:[column("Order","reference"),column("Customer","name"),moneyColumn,status,column("Invoice","invoice_id","id","INV"),created],
  invoices:[column("Invoice","reference"),column("Contact","name"),column("Type","kind"),moneyColumn,column("Due date","due_date","date"),column("Status","display_status","status")],
  users:[name,column("Email","email"),column("Role","role"),created],
  audit:[column("Event","id","id","EV"),column("Action","action"),column("Actor","name"),column("Entity","entity"),column("Record ID","entity_id"),column("Timestamp","created_at","time")],
  notifications:[column("Update","message"),status,column("Received","created_at","time")],
  reports:[column("Metric","name"),column("Value","value"),column("Scope","note")],
};
export function formatCell(row:Row, col:Column,currency: string): Scalar {
  const value=row[col.key];
  if (value==null) return "—";
  if (col.format==="date") return dateLabel(value);
  if (col.format==="time") return prettyTime(value);
  if (col.format==="money") return money(Number(value),String(row.currency??currency));
  if (col.format==="delta") return Number(value)>0?"+"+value:String(value);
  if (col.format==="id") return docNumber(col.prefix??"",value);
  return value;
}
export const createActions: Partial<Record<Module,{permission:string;action:string;label:string}>> = {
  employees:{permission:"employees.manage",action:"employee.save",label:"Add employee"},
  leave:{permission:"leave.submit",action:"leave.submit",label:"Request leave"},
  purchasing:{permission:"purchasing.submit",action:"purchase.submit",label:"New purchase request"},
  orders:{permission:"orders.create",action:"order.create",label:"Issue purchase order"},
  inventory:{permission:"inventory.manage",action:"product.save",label:"Add stock item"},
  movements:{permission:"inventory.manage",action:"stock.adjust",label:"Record adjustment"},
  suppliers:{permission:"suppliers.manage",action:"supplier.save",label:"Add supplier"},
  users:{permission:"users.manage",action:"user.create",label:"Add user"},
};
