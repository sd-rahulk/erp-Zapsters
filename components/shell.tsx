"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, Building2, CalendarDays, ChevronDown, ChevronRight, LogOut, Menu, X } from "lucide-react";
import { canOpen, dateLabel, href, modules, type Actor, type Module } from "@/lib/types";
import { moduleIcons } from "./icons";
import { Avatar, Brand } from "./primitives";

const groups: {label:string; items:Module[]}[] = [
  {label:"Workspace",items:["dashboard","reports"]},
  {label:"People",items:["employees","leave"]},
  {label:"Operations",items:["purchasing","orders","inventory","movements","suppliers"]},
  {label:"Finance",items:["sales","invoices"]},
  {label:"Administration",items:["users","audit","settings"]},
];

export function Shell({actor,module,unread,today,children}: {actor:Actor;module:Module;unread:number; today:string; children:React.ReactNode}) {
  const [menu,setMenu] = useState(false);
  const [profile,setProfile] = useState(false);
  const [signingOut,setSigningOut] = useState(false);
  const [signOutError,setSignOutError] = useState("");
  const router = useRouter();
  useEffect(()=>{
    function onKey(event: KeyboardEvent) {
      if (event.key==="Escape") {setMenu(false);setProfile(false);}
    }
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[]);
  async function signOut() {
    setSigningOut(true);
    setSignOutError("");
    try {
      const response = await fetch("/api/session",{method:"DELETE"});
      if (!response.ok) throw new Error("Couldn’t sign out. Try again.");
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setSignOutError("Couldn’t sign out. Try again.");
      setSigningOut(false);
    }
  }
  return <div className="workspace">
    <a className="skip" href="#content">Skip to content</a>
    {menu && <button className="mobile-backdrop" aria-label="Close navigation" onClick={()=>setMenu(false)}/>}
    <aside id="workspace-navigation" className={"sidebar"+(menu?" sidebar-open":"")}>
      <div className="sidebar-brand"><Link href="/" onClick={()=>setMenu(false)} aria-label="Zapsters ERP overview"><Brand/></Link>
        <button type="button" className="icon-button nav-close" aria-label="Close navigation" onClick={()=>setMenu(false)}><X size={20}/></button></div>
      <div className="company"><span className="company-icon"><Building2 size={18}/></span><span><strong>{actor.company}</strong><small>Company workspace</small></span></div>
      <nav aria-label="Workspace navigation" className="navigation">
        {groups.map(group=>{
          const items=group.items.filter(item=>canOpen(actor,item));
          if (!items.length) return null;
          return <div key={group.label} className="nav-group"><p>{group.label}</p>{items.map(item=>{
            const Icon = moduleIcons[item];
            return <Link href={href(item)} key={item} aria-current={module===item?"page":undefined} onClick={()=>setMenu(false)}>
              <Icon size={18} strokeWidth={1.85}/><span>{modules[item].title}</span></Link>;
          })}</div>;
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="local-label"><span className="live-dot"/>Local demo</div>
        <button type="button" className="account-button" aria-expanded={profile} aria-controls="account-menu" onClick={()=>setProfile(!profile)}>
          <Avatar name={actor.name}/><span className="account-text"><strong>{actor.name}</strong><small>{actor.role}</small></span>
          <ChevronDown size={15} aria-hidden="true"/>
        </button>
        {profile && <div id="account-menu" className="account-menu">
          <span>{actor.email}</span>
          <button type="button" onClick={signOut} disabled={signingOut}><LogOut size={16}/>{signingOut?"Signing out…":"Sign out / switch role"}</button>
          {signOutError && <p role="alert">{signOutError}</p>}
        </div>}
      </div>
    </aside>
    <div className="workspace-body">
      <header className="topbar">
        <div className="crumb"><button className="icon-button nav-menu" aria-label="Open navigation" aria-expanded={menu} aria-controls="workspace-navigation" onClick={()=>setMenu(true)}><Menu size={21}/></button>
          <span className="crumb-root">Workspace</span><ChevronRight className="crumb-arrow" size={14}/><strong>{modules[module].title}</strong>
        </div>
        <div className="top-tools"><span className="top-date"><CalendarDays size={16}/>{dateLabel(today)}</span>
          <Link href="/notifications" className="icon-button notification-button" aria-label={`Notifications, ${unread} unread`}><Bell size={19}/>{unread>0&&<span className="notification-dot"/>}</Link>
        </div>
      </header>
      <main className="content" id="content">{children}</main>
    </div>
  </div>;
}
