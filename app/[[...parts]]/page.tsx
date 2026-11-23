import { notFound, redirect } from "next/navigation";
import { actorForSession } from "@/lib/server/auth";
import { AppError, today } from "@/lib/server/db";
import { getDataset, unreadCount } from "@/lib/server/queries";
import { dashboard } from "@/lib/server/overview";
import { canOpen, modules, type Module } from "@/lib/types";
import { Shell } from "@/components/shell";
import { Overview } from "@/components/overview";
import { Records } from "@/components/records";
import Link from "next/link";

type Props = {params:Promise<{parts?:string[]}>;searchParams:Promise<Record<string,string|string[]|undefined>>};
export default async function Workspace({params,searchParams}: Props) {
  const parts = (await params).parts ?? [];
  const actor = await actorForSession();
  if (!actor) redirect("/sign-in");
  const module = (parts[0] || "dashboard") as Module;
  const id = parts[1] ? Number(parts[1]) : undefined;
  if (!Object.hasOwn(modules,module) || parts.length>2 || (parts[1] &&
    (!/^\d+$/.test(parts[1]) || !Number.isSafeInteger(id) || id===0 || ["dashboard","reports","settings"].includes(module)))) notFound();
  const query = await searchParams;
  const queryValue = (key: string) => typeof query[key]==="string" ? query[key] : undefined;
  const page = Number(queryValue("page"));
  const filters = {openNew:queryValue("new")==="1",q:queryValue("q"),status:queryValue("status"),sort:queryValue("sort"),
    page:Number.isSafeInteger(page)&&page>=1?page:1,id};
  let content;
  try {
    if (!canOpen(actor,module)) throw new AppError("This workspace is unavailable to your role.",403);
    content = module==="dashboard"
      ? <Overview actor={actor} data={dashboard(actor)} today={today()} />
      : <Records actor={actor} module={module} data={getDataset(actor,module,filters)} filters={filters}/>;
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    content = <div className="panel empty large"><h1>{error.status===403?"Workspace restricted":"Record unavailable"}</h1>
      <p>{error.message}</p><Link className="button primary" href="/">Back to overview</Link></div>;
  }
  return <Shell actor={actor} module={module} unread={unreadCount(actor)} today={today()}>{content}</Shell>;
}
