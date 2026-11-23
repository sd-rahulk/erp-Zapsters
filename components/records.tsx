"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Inbox, Plus, Search, ShieldCheck } from "lucide-react";
import { can, href, modules, pageSize, type Actor, type Dataset, type Module } from "@/lib/types";
import { columns, createActions, formatCell } from "./record-config";
import { Status } from "./primitives";
import { RecordDetail } from "./record-detail";
import { CommandForm, sendCommand } from "./command-form";

type Filters = {q?:string;status?:string;sort?:string;page?:number;id?:number;openNew?:boolean};
function address(module:Module, filters:Filters, id?:number) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q",filters.q);
  if (filters.status) params.set("status",filters.status);
  if (filters.sort) params.set("sort",filters.sort);
  if (filters.page && filters.page>1) params.set("page",String(filters.page));
  return href(module)+(id?"/"+id:"")+(params.size?"?"+params.toString():"");
}
export function Records({actor,module,data,filters}: {actor:Actor;module:Module;data:Dataset;filters:Filters}) {
  return <RecordsView key={module} actor={actor} module={module} data={data} filters={filters}/>;
}
function RecordsView({actor,module,data,filters}: {actor:Actor;module:Module;data:Dataset;filters:Filters}) {
  const router = useRouter();
  const [pending,startTransition] = useTransition();
  const [action,setAction] = useState<string|null>(()=>{
    const create = createActions[module];
    return filters.openNew && create && can(actor,create.permission) && actor.employeeId ? create.action : null;
  });
  const [feedback,setFeedback] = useState("");
  const [failure,setFailure] = useState("");
  const definition=modules[module];
  const fields=columns[module]??[];
  const create=createActions[module];
  const mayCreate=create && can(actor,create.permission) && (!["leave","purchasing"].includes(module) || !!actor.employeeId);
  const close = () => {
    setAction(null);
    if (filters.openNew) router.replace(address(module,filters));
  };
  function navigate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const target = address(module,{q:String(form.get("q")??"").trim(),status:String(form.get("status")??""),sort:String(form.get("sort")??"")});
    startTransition(()=>router.push(target));
  }
  function saved(id: number, command: string) {
    close();
    setFeedback(command==="leave.submit"||command==="purchase.submit" ? "Request submitted." :
      command==="order.receive" ? "Receipt recorded and stock updated." : command==="order.create" ? "Purchase order issued." : "Changes saved.");
    const target = command==="order.create" ? "/orders/"+id
      : ["leave.submit","purchase.submit","employee.save","product.save","supplier.save","user.create"].includes(command)
      ? address(module,filters,id) : null;
    if (target) router.push(target);
    router.refresh();
  }
  async function markRead() {
    setFailure("");
    try {
      await sendCommand({action:"notifications.read"});
      router.refresh();
      setFeedback("Notifications marked as read.");
    } catch (error) {setFailure(error instanceof Error?error.message:"Unable to update notifications.");}
  }
  if (data.detail) return <>
    {feedback&&<p className="success-message" role="status">{feedback}</p>}
    <RecordDetail actor={actor} module={module} detail={data.detail} back={address(module,filters)} onAction={setAction}/>
    {action&&<CommandForm key={action} action={action} options={data.options} detail={data.detail} onClose={close} onSuccess={saved}/>}
  </>;
  return <div className="records">
    <div className="page-heading"><div><p className="eyebrow"><span className="eyebrow-line"/>{actor.role} workspace</p><h1>{definition.title}</h1><p>{definition.description}</p></div>
      {mayCreate&&<button className="button primary" onClick={()=>setAction(create.action)} disabled={module==="orders"&&!data.options.approved?.length}><Plus size={17}/>{create.label}</button>}
      {module==="notifications"&&data.rows.some(row=>row.status==="Unread")&&<button className="button secondary" onClick={markRead}>Mark all as read</button>}
    </div>
    {feedback&&<p className="success-message" role="status">{feedback}</p>}
    {failure&&<p className="error-message" role="alert">{failure}</p>}
    {module==="settings"?<section className="panel settings-panel"><div className="panel-heading"><div><h2>Company profile</h2><p>Workspace identity and billing currency</p></div>
      <button className="button secondary" onClick={()=>setAction("settings.update")}>Edit company name</button></div>
      <dl className="detail-fields"><div><dt>Company name</dt><dd>{data.rows[0].name}</dd></div><div><dt>Currency</dt><dd>{data.rows[0].currency}</dd></div></dl></section>
    : <>
      {module==="leave"&&!!data.options.balances?.length&&<section className="balance-strip" aria-label="Your leave balances">{data.options.balances.map(option=><span key={option.id}>{option.name}</span>)}</section>}
      {module==="orders"&&can(actor,"orders.create")&&!data.options.approved?.length&&<p className="notice">There are no approved requests available to issue as orders.</p>}
      <section className="panel records-panel">
        {module!=="reports"&&<form className="table-tools" onSubmit={navigate} key={`${filters.q}|${filters.status}|${filters.sort}`}>
          <label className="search-input"><Search size={17}/><span className="sr-only">Search {definition.title}</span><input type="search" name="q" placeholder="Search records…" defaultValue={filters.q} maxLength={100}/></label>
          {data.options.statuses&&<label><select aria-label="Filter records" name="status" defaultValue={filters.status??""}><option value="">All {module==="users"?"roles":module==="movements"||module==="audit"?"types":"statuses"}</option>
            {data.options.statuses.map(option=><option value={option.id} key={option.id}>{option.name}</option>)}</select></label>}
          <label><select aria-label="Sort records" name="sort" defaultValue={filters.sort??""}><option value="">Default sort</option><option value="recent">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option></select></label>
          <button className="button secondary" disabled={pending}>{pending?"Loading…":"Apply"}</button>
          {(filters.q||filters.status||filters.sort)&&<Link className="text-button" href={href(module)}>Clear</Link>}
        </form>}
        {data.rows.length ? <div className="scroll-table"><table><thead><tr>{fields.map(field=><th key={field.key} scope="col">{field.label}</th>)}{module!=="reports"&&<th scope="col"><span className="sr-only">Open record</span></th>}</tr></thead>
          <tbody>{data.rows.map(row=>{
            const target=module==="reports"?href(row.module as Module):address(module,filters,Number(row.id));
            return <tr key={row.id}>{fields.map((field,index)=><td key={field.key}>
              {field.format==="status"?<Status value={row[field.key]}/>
                :index===0?<Link className="cell-link" href={target}>{formatCell(row,field,actor.currency)}</Link>
                :formatCell(row,field,actor.currency)}</td>)}
              {module!=="reports"&&<td><Link className="icon-button row-button" href={target} aria-label={`Open ${formatCell(row,fields[0],actor.currency)}`}><ChevronRight size={17}/></Link></td>}
            </tr>;
          })}</tbody></table></div> : <div className="empty large"><Inbox size={28}/><h2>No matching records</h2><p>{filters.q||filters.status?"Try different filters or clear your search.":"Records in your scope will appear here."}</p></div>}
        {module!=="reports"&&<div className="pagination"><span>{data.total?`${(data.page-1)*pageSize+1}–${Math.min(data.page*pageSize,data.total)} of ${data.total}`:"0 records"}</span><div>
          {data.page>1&&<Link className="icon-button" aria-label="Previous page" href={address(module,{...filters,page:data.page-1})}><ChevronLeft size={18}/></Link>}
          {data.page*pageSize<data.total&&<Link className="icon-button" aria-label="Next page" href={address(module,{...filters,page:data.page+1})}><ChevronRight size={18}/></Link>}
        </div></div>}
      </section>
      {module==="users"&&<section className="panel permissions-panel"><div className="panel-heading"><div><h2>Role permissions</h2><p>Permission grants for the six workspace roles</p></div><ShieldCheck size={20}/></div>
        {data.options.permissions?.map(role=><details key={role.id}><summary>{role.id}</summary><div className="permission-list">{role.name.split(", ").map(permission=><code key={permission}>{permission}</code>)}</div></details>)}</section>}
    </>}
    {action&&<CommandForm key={action} action={action} options={data.options} settingsName={actor.company} onClose={close} onSuccess={saved}/>}
  </div>;
}
