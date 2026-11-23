import { Check, Circle, Clock3, Minus, X } from "lucide-react";
import type { Scalar } from "@/lib/types";

export function Brand({light=false}: {light?:boolean}) {
  return <div className={"brand"+(light?" brand-light":"")}><span className="brand-mark" aria-hidden="true"><i/><i/><i/></span>
    <span><strong>Zapsters</strong><small>ERP WORKSPACE</small></span></div>;
}
export function Avatar({name,className=""}: {name:string;className?:string}) {
  const initials = name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase();
  const palette = name.split("").reduce((sum,char)=>sum+char.charCodeAt(0),0)%4;
  return <span className={`avatar avatar-${palette} ${className}`} aria-hidden="true">{initials}</span>;
}
export function Status({value}: {value:Scalar}) {
  if (!value) return <span>—</span>;
  const text = String(value);
  const tone = ["Approved","Paid","Received","Completed","Active","In stock","Read"].includes(text) ? "green"
    : ["Pending","Partially Received","Low stock","On leave","Unread"].includes(text) ? "amber"
    : ["Rejected","Overdue","Void"].includes(text) ? "red"
    : ["Ordered","Open"].includes(text) ? "blue":"gray";
  const Icon = tone==="green"?Check:tone==="amber"?Clock3:tone==="red"?X:tone==="gray"?Minus:Circle;
  return <span className={"status status-"+tone}><Icon size={13} aria-hidden="true"/>{text}</span>;
}
