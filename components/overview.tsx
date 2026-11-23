import Link from "next/link";
import { Bell, CalendarDays, ChevronRight, ClipboardList, Plus, Warehouse } from "lucide-react";
import { can, dateLabel, href, type Actor, type DashboardData, type Module } from "@/lib/types";
import { metricIcons, moduleIcons } from "./icons";
import { Avatar, Status } from "./primitives";

export function Overview({actor,data,today}: {actor:Actor;data:DashboardData;today:string}) {
  const first = actor.name.split(" ")[0];
  const manager=can(actor,"leave.decide");
  const admin=can(actor,"audit.read");
  const inventory=can(actor,"orders.receive");
  const finance=can(actor,"invoices.manage");
  const queueTitle=admin?"Recent audit activity":inventory?"Incoming deliveries":finance?"Invoices to track":manager?"Requests to review":"Pending requests";
  const primary: Module=admin?"users":inventory?"orders":finance?"invoices":"leave";
  const link = href(primary)+(primary==="leave"?"?new=1":"");
  const primaryText = admin?"Manage users":inventory?"View deliveries":finance?"View invoices":"Request leave";
  const peak = Math.max(4,...data.chart.flatMap(bucket=>[bucket.leave,bucket.purchase]));
  const ceiling = Math.ceil(peak/2)*2;
  return <div className="overview">
    <div className="page-heading">
      <div><p className="eyebrow"><span className="eyebrow-line"/>{actor.role} workspace</p><h1>Overview</h1>
        <p>{manager?"Review your team’s requests and keep orders moving.":admin?"Manage access and review changes across the workspace.":inventory?"Track stock levels and receive incoming orders.":finance?"Follow open balances, payments, and supplier orders.":"Track your requests and see what needs attention."}</p></div>
      <Link className="button primary" href={link}>{primary==="leave"?<Plus size={17}/>:inventory?<Warehouse size={17}/>:null}{primaryText}</Link>
    </div>
    <section className="welcome contour" aria-label="Workspace welcome">
      <div className="welcome-content"><p className="welcome-date"><CalendarDays size={16}/>{dateLabel(today)}</p>
        <h2>Welcome, {first}.</h2><p>{actor.company}</p></div>
      {data.queue[0]&&<Link className="welcome-side" href={href(data.queue[0].module as Module)+"/"+data.queue[0].id}>
        <span className="welcome-icon"><ClipboardList size={23} strokeWidth={1.7}/></span>
        <div><strong>{data.queue[0].reference}</strong><span>{admin?"Latest audit event":"At the top of your queue"}</span></div></Link>}
    </section>
    <section className="metrics" aria-label="Workspace metrics">
      {data.metrics.map((metric,index)=>{
        const Icon=metricIcons[metric.icon as keyof typeof metricIcons];
        return <Link className="metric panel" key={metric.label} href={href(metric.href)}>
          <div className="metric-top"><span className={`metric-icon metric-tone-${index}`}>{Icon&&<Icon size={19}/>}</span><ChevronRight size={16} className="quiet-chevron"/></div>
          <div className="metric-label">{metric.label}</div><strong>{metric.value}</strong><span className="metric-note">{metric.note}</span>
        </Link>;
      })}
    </section>
    <div className="overview-grid">
      <section className="panel queue">
        <div className="panel-heading"><div><h2>{queueTitle}</h2><p>{manager?"Latest leave and purchase requests":admin?"Latest recorded changes":inventory?"Orders with quantities still outstanding":finance?"Open balances by due date":"Follow up on items within your workspace"}</p></div></div>
        {data.queue.length ? <div className="scroll-table"><table>
          <thead><tr><th scope="col">Reference</th><th scope="col">{inventory?"Supplier":finance?"Contact":"Name"}</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Open record</span></th></tr></thead>
          <tbody>{data.queue.map(row=>{
            const module=row.module as Module;
            const Icon=moduleIcons[module];
            return <tr key={module+row.id}>
              <td><span className="table-reference"><span className={"reference-icon "+(module==="leave"?"reference-violet":"")}><Icon size={16}/></span><span><Link className="cell-link" href={href(module)+"/"+row.id}>{row.reference}</Link><small>{row.type}</small></span></span></td>
              <td><span className="table-person"><Avatar name={String(row.name)}/><span>{row.name}</span></span></td>
              <td><Status value={row.status}/></td>
              <td><Link className="icon-button row-button" href={href(module)+"/"+row.id} aria-label={`Open ${row.reference}`}><ChevronRight size={17}/></Link></td>
            </tr>;
          })}</tbody>
        </table></div> : <div className="empty"><ClipboardList size={24}/><p>No records need your attention right now.</p></div>}
        {manager&&<div className="panel-footer"><Link className="text-button" href="/leave?status=Pending">Review leave requests</Link><Link className="text-button" href="/purchasing?status=Pending">Review purchase requests</Link></div>}
      </section>
      <section className="panel activity">
        {data.chart.length ? <>
          <div className="panel-heading"><div><h2>Request activity</h2><p>Submissions by week</p></div><span className="small-tag">4 weeks</span></div>
          <div className="legend"><span><i/>Leave</span><span><i/>Purchasing</span></div>
          <div className="chart" role="img" aria-label={data.chart.map(bucket=>`Week of ${bucket.label}, ${bucket.leave} leave and ${bucket.purchase} purchase requests`).join(". ")}>
            <div className="chart-grid"><b>{ceiling}</b><b>{Math.ceil(ceiling/2)}</b><b>0</b></div>
            <div className="chart-weeks">{data.chart.map(bucket=><div className="chart-week" key={bucket.label}>
              <div className="bars"><i style={{height:bucket.leave/ceiling*100+"%"}} title={bucket.leave+" leave"}/><i style={{height:bucket.purchase/ceiling*100+"%"}} title={bucket.purchase+" purchase"}/></div>
              <span>{bucket.label}</span></div>)}</div>
          </div>
        </> : <div className="panel-heading"><div><h2>Notifications</h2><p>Updates for your account</p></div></div>}
        <div className="dashboard-updates">
          {data.chart.length>0&&<h3>Recent updates</h3>}
          {data.updates.length ? data.updates.slice(0,2).map(row=><div className="update" key={row.id}><span className="update-icon"><Bell size={15}/></span><div><p>{row.message}</p><small>{dateLabel(row.created_at)}</small></div></div>)
            : <p className="muted no-updates">You’re all caught up.</p>}
          <Link className="text-button" href="/notifications">View notifications</Link>
        </div>
      </section>
    </div>
  </div>;
}
