"use client";
import { cloneElement, useEffect, useId, useRef, useState, type FormEvent, type ReactElement } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { Dataset, Option, Row } from "@/lib/types";

export async function sendCommand(payload: Record<string,unknown>) {
  const response = await fetch("/api/commands",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The operation could not be completed.");
  return Number(result.id);
}
type Detail = Dataset["detail"];
type Options = Dataset["options"];
const labels: Record<string,string> = {
  "leave.submit":"Request leave","leave.decide":"Decide leave request","purchase.submit":"New purchase request","purchase.decide":"Decide purchase request",
  "order.create":"Issue purchase order","order.receive":"Record goods receipt","stock.adjust":"Record stock adjustment",
  "employee.save":"Employee profile","product.save":"Stock item","supplier.save":"Supplier profile","invoice.update":"Update invoice",
  "role.update":"Change workspace role","user.create":"Add user","settings.update":"Edit company name","notifications.read":"Mark as read",
};
const review: Record<string,string> = {
  "leave.decide":"Approval deducts working days from the employee’s balance. Rejection preserves the balance and shares your reason.",
  "purchase.decide":"The decision will be recorded and shared with the requester.",
  "order.create":"Issuing this order locks the approved line quantities and costs on the purchase order.",
  "order.receive":"The selected quantities will be added to stock and recorded in the movement ledger.",
  "stock.adjust":"This adjustment will change the warehouse count and create a permanent ledger entry.",
  "invoice.update":"This update creates a financial audit entry. A recorded payment settles the invoice in full.",
  "role.update":"This changes the user’s access immediately and signs them out of existing sessions.",
  "employee.save":"Changes to an employee’s reporting line can transfer pending requests to a new manager.",
};

function Field({label,children}: {label:string;children:ReactElement<{id?:string}>}) {
  const id = useId();
  return <div className="field"><label htmlFor={id}>{label}</label>{cloneElement(children,{id})}</div>;
}
function Select({id,name,options=[],defaultValue,placeholder,required=true}: {
  id?:string;name:string;options?:Option[];defaultValue?:string|number;placeholder?:string;required?:boolean;
}) {
  return <select id={id} name={name} defaultValue={defaultValue??""} required={required}>
    <option value="">{placeholder??"Select an option"}</option>{options.map(option=><option key={option.id} value={option.id}>{option.name}</option>)}
  </select>;
}
function Quantity({id,name,value,min=1,max=100000}: {id?:string;name:string;value?:number;min?:number;max?:number}) {
  return <input id={id} name={name} type="number" min={min} max={max} step={1} defaultValue={value} required/>;
}
function Notes({id,name="reason",required=true,placeholder}: {id?:string;name?:string;required?:boolean;placeholder?:string}) {
  return <textarea id={id} name={name} rows={3} maxLength={800} minLength={required?4:undefined} required={required} placeholder={placeholder}/>;
}
const value = (row:Row|undefined,key:string) => row?.[key] == null ? "" : String(row[key]);
const decimal = (minor: string) => minor ? (Number(minor)/100).toFixed(2) : "";

export function CommandForm({action,options,detail,settingsName,onClose,onSuccess}: {
  action:string; options:Options; detail?:Detail;settingsName?:string;onClose:()=>void;onSuccess:(id:number,action:string)=>void;
}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const operation=useRef<string|null>(null);
  const nextLine=useRef(1);
  const [lines,setLines]=useState([0]);
  const [outcome,setOutcome]=useState("Approved");
  const [invoiceOutcome,setInvoiceOutcome]=useState("Paid");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [confirmation,setConfirmation]=useState<Record<string,unknown>|null>(null);
  const record=detail?.record;
  const title=labels[action]??"Save changes";
  useEffect(()=>{dialog.current?.showModal();},[]);

  function payload(form: FormData): Record<string,unknown> {
    operation.current ??= crypto.randomUUID();
    const field=(name:string)=>String(form.get(name)??"");
    const num=(name:string)=>Number(field(name));
    const id=record?.id ? Number(record.id) : undefined;
    switch(action) {
      case "leave.submit":return {action,typeId:num("typeId"),start:field("start"),end:field("end"),reason:field("reason")};
      case "leave.decide":
      case "purchase.decide": return {action,id,outcome,reason:field("reason")};
      case "purchase.submit":return {action,supplierId:num("supplierId")||null,reason:field("reason"),operation:operation.current,
        lines:lines.map(line=>({productId:num("product-"+line),quantity:num("qty-"+line)}))};
      case "order.create": return {action,id:id??num("requestId"),supplierId:num("supplierId")||undefined};
      case "order.receive": return {action,id,warehouseId:num("warehouseId"),note:field("note"),operation:operation.current,
        lines:(detail?.lines??[]).map(line=>({lineId:Number(line.id),quantity:num("qty-"+line.id)})).filter(line=>line.quantity>0)};
      case "stock.adjust": return {action,productId:id??num("productId"),warehouseId:num("warehouseId"),delta:num("delta"),note:field("note"),operation:operation.current};
      case "product.save":return {action,id,sku:field("sku"),name:field("name"),category:field("category"),cost:field("cost"),reorder:num("reorder")};
      case "supplier.save":return {action,id,name:field("name"),email:field("email"),category:field("category")};
      case "employee.save":return {action,id,name:field("name"),email:field("email"),title:field("title"),departmentId:num("departmentId"),
        managerId:num("managerId")||null,active:field("active")==="1"};
      case "user.create":return {action,name:field("name"),email:field("email"),password:field("password"),role:field("role")};
      case "role.update":return {action,id,role:field("role")};
      case "invoice.update":return {action,id,outcome:invoiceOutcome,reason:field("reason")};
      case "settings.update":return {action,name:field("name")};
      default:return {action,id};
    }
  }
  async function save(command: Record<string,unknown>) {
    setBusy(true);
    setError("");
    try { onSuccess(await sendCommand(command),action); }
    catch (failure) {
      setError(failure instanceof Error?failure.message:"Unable to save changes.");
      setConfirmation(null);
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    const command=payload(new FormData(event.currentTarget));
    if (action==="order.receive" && !(command.lines as unknown[]).length) {setError("Enter a received quantity for at least one line.");return;}
    if (review[action]) setConfirmation(command);
    else void save(command);
  }
  function fields() {
    switch (action) {
      case "leave.submit":return <>
        <Field label="Leave type"><Select name="typeId" options={options.types}/></Field>
        <div className="form-grid"><Field label="Start date"><input name="start" type="date" required/></Field><Field label="End date"><input name="end" type="date" required/></Field></div>
        <p className="field-hint">Weekdays count toward your balance. Choose dates in the same calendar year.</p>
        <Field label="Reason"><Notes/></Field></>;
      case "leave.decide":
      case "purchase.decide":return <>
        <Field label="Decision"><select name="outcome" value={outcome} onChange={event=>setOutcome(event.target.value)}><option value="Approved">Approve</option><option value="Rejected">Reject</option></select></Field>
        <Field label={outcome==="Rejected"?"Rejection reason":"Decision note (optional)"}><Notes required={outcome==="Rejected"}/></Field></>;
      case "purchase.submit":return <>
        <Field label="Supplier (optional)"><Select name="supplierId" options={options.suppliers} required={false} placeholder="Supplier unknown"/></Field>
        <fieldset><legend>Requested items</legend><div className="line-fields">
        {lines.map((line,index)=><div className="line-entry" key={line}>
          <Field label={`Item ${index+1}`}><Select name={"product-"+line} options={options.products}/></Field>
          <Field label="Quantity"><Quantity name={"qty-"+line} value={1}/></Field>
          {lines.length>1&&<button type="button" className="icon-button" onClick={()=>setLines(lines.filter(entry=>entry!==line))} aria-label={"Remove item "+(index+1)}><Trash2 size={17}/></button>}</div>)}
        </div><button className="text-button" type="button" disabled={lines.length>=Math.min(25,options.products?.length??0)} onClick={()=>setLines([...lines,nextLine.current++])}><Plus size={16}/>Add line</button></fieldset>
        <Field label="Reason"><Notes/></Field></>;
      case "order.create":return <>
        {record?<p className="notice">The approved request’s lines, quantities, and costs will be copied to the order.</p>
          :<Field label="Approved request"><Select name="requestId" options={options.approved}/></Field>}
        {record?.supplier_id ? <p className="field-hint">Supplier · {record.supplier}</p>
          : <Field label={record?"Supplier":"Supplier if unspecified on request"}><Select name="supplierId" options={options.suppliers} required={!!record} placeholder="Use the request supplier"/></Field>}</>;
      case "order.receive":return <>
        <Field label="Receiving warehouse"><Select name="warehouseId" options={options.warehouses}/></Field>
        <fieldset><legend>Received items</legend><div className="receipt-fields">
          {detail?.lines.filter(line=>Number(line.received)<Number(line.quantity)).map(line=>{
            const outstanding=Number(line.quantity)-Number(line.received);
            return <Field key={line.id} label={`${line.name} · ${outstanding} outstanding`}><Quantity name={"qty-"+line.id} value={0} min={0} max={outstanding}/></Field>;
          })}</div></fieldset>
        <Field label="Delivery note (optional)"><Notes name="note" required={false}/></Field></>;
      case "stock.adjust":return <>
        {!record&&<Field label="Stock item"><Select name="productId" options={options.products}/></Field>}
        <Field label="Warehouse"><Select name="warehouseId" options={options.warehouses}/></Field>
        <Field label="Quantity change"><Quantity name="delta" min={-100000}/></Field>
        <p className="field-hint">Use a positive quantity to add stock or a negative quantity to remove it.</p>
        <Field label="Reason"><Notes name="note"/></Field></>;
      case "product.save":return <>
        <div className="form-grid"><Field label="SKU"><input name="sku" required maxLength={32} defaultValue={value(record,"sku")}/></Field>
          <Field label="Category"><input name="category" required maxLength={40} defaultValue={value(record,"category")}/></Field></div>
        <Field label="Item name"><input name="name" required maxLength={90} defaultValue={value(record,"name")}/></Field>
        <div className="form-grid"><Field label="Unit cost"><input name="cost" inputMode="decimal" required defaultValue={decimal(value(record,"unit_cost_minor"))}/></Field>
        <Field label="Reorder point"><Quantity name="reorder" min={0} value={Number(record?.reorder_point??0)}/></Field></div></>;
      case "supplier.save":return <>
        <Field label="Supplier name"><input name="name" required maxLength={90} defaultValue={value(record,"name")}/></Field>
        <Field label="Contact email"><input type="email" name="email" required defaultValue={value(record,"email")}/></Field>
        <Field label="Category"><input name="category" required maxLength={40} defaultValue={value(record,"category")}/></Field></>;
      case "employee.save":return <>
        <Field label="Full name"><input name="name" required maxLength={90} defaultValue={value(record,"name")}/></Field>
        <Field label="Work email"><input type="email" name="email" required defaultValue={value(record,"email")}/></Field>
        <Field label="Job title"><input name="title" required maxLength={90} defaultValue={value(record,"title")}/></Field>
        <div className="form-grid"><Field label="Department"><Select name="departmentId" options={options.departments} defaultValue={value(record,"department_id")}/></Field>
        <Field label="Manager"><Select name="managerId" options={options.managers?.filter(manager=>manager.id!==record?.id)} defaultValue={value(record,"manager_id")} required={false} placeholder="No manager"/></Field></div>
        <Field label="Employment status"><select name="active" defaultValue={String(record?.active??1)}><option value="1">Active</option><option value="0">Inactive</option></select></Field></>;
      case "invoice.update":return <>
        <Field label="New status"><select name="outcome" value={invoiceOutcome} onChange={event=>setInvoiceOutcome(event.target.value)}><option value="Paid">Paid in full</option><option value="Void">Void invoice</option></select></Field>
        <Field label={invoiceOutcome==="Paid"?"Payment reference":"Reason for voiding"}><input name="reason" minLength={3} maxLength={200} required/></Field></>;
      case "role.update":return <Field label="New role"><Select name="role" options={options.roles} defaultValue={value(record,"role")}/></Field>;
      case "user.create":return <>
        <Field label="Full name"><input name="name" required maxLength={90}/></Field>
        <Field label="Work email"><input name="email" type="email" required maxLength={150}/></Field>
        <Field label="Initial password"><input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></Field>
        <Field label="Role"><Select name="role" options={options.roles} defaultValue="Employee"/></Field></>;
      case "settings.update":return <Field label="Company name"><input name="name" defaultValue={settingsName} required maxLength={90}/></Field>;
      default:return null;
    }
  }
  return <dialog ref={dialog} className="command-dialog" aria-labelledby="command-title" onCancel={event=>{event.preventDefault();if (!busy) onClose();}}>
    <div className="dialog-heading"><h2 id="command-title">{title}</h2><button className="icon-button" type="button" onClick={onClose} disabled={busy} aria-label="Close form"><X size={21}/></button></div>
    <form onSubmit={submit} hidden={!!confirmation}>
      <div className="dialog-fields">{fields()}{error&&<p className="error-message" role="alert">{error}</p>}</div>
      <div className="dialog-footer"><button className="button secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="button primary" disabled={busy}>{busy?"Saving…":review[action]?"Review":action==="leave.submit"||action==="purchase.submit"?"Submit request":"Save changes"}</button></div>
    </form>
    {confirmation&&<div><div className="dialog-fields"><h3>Confirm change</h3><p>{review[action]}</p>{typeof confirmation.outcome==="string"&&<p><strong>Selected status</strong> · {confirmation.outcome}</p>}</div>
      <div className="dialog-footer"><button className="button secondary" type="button" onClick={()=>setConfirmation(null)} disabled={busy} autoFocus>Back</button>
        <button className="button primary" type="button" onClick={()=>void save(confirmation)} disabled={busy}>{busy?"Saving…":"Confirm"}</button></div></div>}
  </dialog>;
}
