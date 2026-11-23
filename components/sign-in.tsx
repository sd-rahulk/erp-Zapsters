"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Boxes, CalendarDays, Eye, EyeOff, FileChartColumn, LockKeyhole, ShieldCheck, ShoppingCart, UsersRound } from "lucide-react";
import { Brand } from "./primitives";

const roles = [
  {role:"Manager", key:"manager", icon:UsersRound}, {role:"Employee",key:"employee",icon:CalendarDays},
  {role:"Inventory",key:"inventory",icon:Boxes},{role:"Finance",key:"finance",icon:FileChartColumn},
  {role:"HR",key:"hr",icon:UsersRound},{role:"Admin",key:"admin",icon:ShieldCheck}
];
export function SignIn({enabled,demoHint}: {enabled:boolean;demoHint?:string}) {
  const router = useRouter();
  const [email,setEmail] = useState("manager@zapsters.demo");
  const [password,setPassword] = useState("");
  const [visible,setVisible] = useState(false);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:email.trim(),password})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      router.replace("/");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to sign in. Try again.");
      setBusy(false);
    }
  }
  return <main className="sign-in">
    <aside className="sign-story contour">
      <Brand light/>
      <div className="sign-story-content">
        <p className="eyebrow"><span className="eyebrow-line"/>NORTHSTAR SUPPLY CO.</p>
        <h2>Run the business<br/>from one place.</h2>
        <p>See what’s waiting for approval, what’s arriving at the warehouse, and who’s available.</p>
        <div className="story-flows">
          <span><CalendarDays size={18}/>Leave approvals</span>
          <span><ShoppingCart size={18}/>Purchasing & receiving</span>
          <span><Boxes size={18}/>Inventory & finance</span>
        </div>
      </div>
      <footer><span className="live-dot"/>Local demo workspace</footer>
    </aside>
    <section className="sign-form-side">
      <div className="sign-form-wrap">
        <div className="mobile-brand"><Brand/></div>
        <div className="sign-lock"><LockKeyhole size={21}/></div>
        <h1>Sign in</h1>
        <p className="sign-subtitle">Choose an account to open your workspace.</p>
        {enabled ? <>
          <div className="persona-label">Demo accounts</div>
          <div className="personas">{roles.map(({role,key,icon:Icon})=>{
            const address = key+"@zapsters.demo";
            return <button key={key} type="button" aria-pressed={email===address} onClick={()=>{setEmail(address);setError("");}}><Icon size={16}/>{role}</button>;
          })}</div>
          <form onSubmit={submit} className="sign-form">
            <div className="field"><label htmlFor="sign-in-email">Work email</label><input id="sign-in-email" type="email" name="email" autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)} required/></div>
            <div className="field"><label htmlFor="sign-in-password">Password</label>
              <span className="password-field"><input id="sign-in-password" type={visible?"text":"password"} name="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required/>
                <button type="button" className="icon-button" aria-label={visible?"Hide password":"Show password"} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></span>
            </div>
            <p className="demo-hint">Demo password <code>{demoHint}</code> <button type="button" className="text-button" onClick={()=>setPassword(demoHint ?? "")}>Use password</button></p>
            {error && <div className="error-message" role="alert">{error}</div>}
            <button className="button primary sign-submit" disabled={busy}>{busy?"Signing in…":"Sign in to workspace"}</button>
          </form>
        </> : <p className="error-message">The local demo is disabled. Set up the workspace using README.md.</p>}
      </div>
    </section>
  </main>;
}
