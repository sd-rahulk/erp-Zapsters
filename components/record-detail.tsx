import Link from "next/link";
import { ArrowLeft, ChevronRight, Clock3, PackageCheck } from "lucide-react";
import { canOpen, dateLabel, docNumber, href, modules, money, prettyTime, type Actor, type Dataset, type Module, type Row, type Scalar } from "@/lib/types";
import { columns, formatCell } from "./record-config";
import { moduleIcons } from "./icons";
import { Status } from "./primitives";

const actions: Record<string,string> = {
  "employee.save":"Edit employee","leave.decide":"Review request","purchase.decide":"Review request",
  "order.create":"Issue purchase order","order.receive":"Record receipt","product.save":"Edit item","stock.adjust":"Adjust stock",
  "supplier.save":"Edit supplier","invoice.update":"Update status","role.update":"Change role","notifications.read":"Mark as read",
};
const timelineModules = new Set(["leave","purchasing","orders","invoices","users","employees"]);
type Pair = [string,React.ReactNode];
function Fields({pairs}: {pairs:Pair[]}) {
  return <dl className="detail-fields">{pairs.map(([label,content])=><div key={label}><dt>{label}</dt><dd>{content??"—"}</dd></div>)}</dl>;
}
function attributes(actor:Actor,module:Module,row:Row): Pair[] {
  const values:Pair[] = (columns[module]??[]).map(col=>[col.label,col.format==="status"?<Status value={row[col.key]}/>:formatCell(row,col,actor.currency)]);
  const add=(...items:Pair[])=>values.push(...items);
  const recordLink=(target:Module,id:Scalar,label:string) => !id?"—":canOpen(actor,target)?<Link className="text-button" href={href(target)+"/"+id}>{docNumber(label,id)}</Link>:docNumber(label,id);
  switch(module) {
    case "employees":add(["Work email",row.email]);break;
    case "leave":
      add(["Submitted",prettyTime(row.created_at)],["Assigned manager",row.manager],["Decided by",row.approver],["Decision time",prettyTime(row.decided_at)]);break;
    case "purchasing":
      add(["Assigned manager",row.manager],["Decided by",row.approver],["Decision time",prettyTime(row.decided_at)],["Purchase order",recordLink("orders",row.order_id,"PO")]);break;
    case "orders":
      add(["Issued by",row.issuer]);break;
    case "inventory":
      add(["Unit cost",money(Number(row.unit_cost_minor),actor.currency)]);break;
    case "movements":
      add(["Note",row.note],["Goods receipt",row.receipt_id?docNumber("GR",row.receipt_id):"—"],["Purchase order",recordLink("orders",row.order_id,"PO")]);break;
    case "sales":if (row.invoice_id) values[4]=["Invoice",recordLink("invoices",row.invoice_id,"INV")];break;
    case "invoices":
      add(["Sales order",recordLink("sales",row.sales_order_id,"SO")],["Purchase order",recordLink("orders",row.purchase_order_id,"PO")]);break;
    case "users":
      add(["Role updated",prettyTime(row.updated_at)]);break;
    case "audit":
      add(["Previous value",row.before_value],["Recorded value",row.after_value]);break;
    case "notifications":
      if (row.can_open) add(["Related record",recordLink(row.module as Module,row.entity_id,row.module==="leave"?"LV":row.module==="orders"?"PO":"PR")]);
      break;
  }
  return values;
}
function Lines({rows,type,currency}: {rows:Row[];type:Module;currency:string}) {
  if (!rows.length) return null;
  const fields = type==="employees"?[["Leave type","name"],["Year","year"],["Entitlement","entitlement"],["Remaining","remaining"]]
    :type==="inventory"?[["Warehouse","name"],["On hand","quantity"]]
    :[["Item","name"],["SKU","sku"],["Quantity","quantity"],...(type==="orders"?[["Received","received"]]:[]),["Total","total_minor"]];
  const title=type==="employees"?"Leave balances":type==="inventory"?"Stock by warehouse":"Line items";
  return <section className="panel"><div className="panel-heading"><h2>{title}</h2></div><div className="scroll-table"><table>
    <thead><tr>{fields.map(([label])=><th scope="col" key={label}>{label}</th>)}</tr></thead>
    <tbody>{rows.map((row,index)=><tr key={index}>{fields.map(([label,key])=><td key={key}>{key==="total_minor"?money(Number(row[key]),currency):row[key]??"—"}</td>)}</tr>)}</tbody>
  </table></div></section>;
}
function Related({rows,type,currency}: {rows:Row[];type:Module;currency:string}) {
  if (!rows.length) return null;
  const invoices=type==="invoices";
  const stock=type==="inventory" || type==="sales";
  return <section className="panel"><div className="panel-heading"><h2>{invoices?"Payments":stock?"Recent stock movements":"Goods receipts"}</h2></div>
    <div className="timeline">{rows.map((row,index)=><div className="timeline-entry" key={String(row.id)+"-"+index}>
      <span className="timeline-icon"><PackageCheck size={16}/></span><div>
        <strong>{invoices?money(Number(row.amount_minor),currency)+" · "+row.reference:stock?`${row.kind} · ${Number(row.delta)>0?"+":""}${row.delta} units`:docNumber("GR",row.id)+" · "+row.quantity+" units"}</strong>
        <p>{[row.item,row.warehouse,row.actor,dateLabel(row.created_at)].filter(Boolean).join(" · ")}</p>{row.note&&<p>{row.note}</p>}
      </div></div>)}</div></section>;
}
export function RecordDetail({actor,module,detail,back,onAction}: {
  actor:Actor;module:Module;detail:NonNullable<Dataset["detail"]>;back:string;onAction:(action:string)=>void;
}) {
  const {record,lines,related,history}=detail;
  const first=columns[module]?.[0];
  const title=first?formatCell(record,first,actor.currency):record.name;
  const currency=String(record.currency??actor.currency);
  const Icon=moduleIcons[module];
  return <div className="record-detail">
    <Link href={back} className="text-button back-link"><ArrowLeft size={17}/>All {modules[module].title.toLowerCase()}</Link>
    <div className="page-heading"><div className="record-heading"><span className="record-heading-icon"><Icon size={24}/></span><div><p className="eyebrow">{modules[module].title}</p><h1>{title}</h1></div></div>
      <div className="detail-actions">{detail.actions.map((action,index)=><button type="button" key={action} className={"button "+(index===0?"primary":"secondary")} onClick={()=>onAction(action)}>{actions[action]}</button>)}</div>
    </div>
    <div className={"detail-grid"+(!timelineModules.has(module)?" no-timeline":"")}>
      <div className="detail-main">
        <section className="panel"><div className="panel-heading"><h2>Record details</h2></div><Fields pairs={attributes(actor,module,record)}/>
          {(record.reason||record.decision_reason)&&<div className="record-notes">{record.reason&&<div><h3>Request reason</h3><p>{record.reason}</p></div>}
            {record.decision_reason&&<div><h3>Decision note</h3><p>{record.decision_reason}</p></div>}</div>}
        </section>
        <Lines rows={lines} type={module} currency={currency}/>
        <Related rows={related} type={module} currency={currency}/>
      </div>
      {timelineModules.has(module)&&<section className="panel history-panel">
        <div className="panel-heading"><div><h2>Activity history</h2><p>Recorded changes and decisions</p></div><Clock3 size={19}/></div>
        {history.length?<div className="timeline">{history.map(event=><div className="timeline-entry" key={event.id}>
          <span className="timeline-icon"><Clock3 size={15}/></span><div><strong>{event.action}</strong><p>{event.actor} · {prettyTime(event.created_at)}</p>
            {event.after_status&&<div className="status-flow">{event.before_status&&<><Status value={event.before_status}/><ChevronRight size={14}/></>}<Status value={event.after_status}/></div>}
            {event.reason&&<p>{event.reason}</p>}</div></div>)}</div>
          :<p className="muted empty-history">No changes have been recorded yet.</p>}
      </section>}
    </div>
  </div>;
}
