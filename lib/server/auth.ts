import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { demoEnabled } from "@/db/sqlite.mjs";
import { verifyPassword } from "@/db/password.mjs";
import { type Actor, type Module, can, canOpen } from "@/lib/types";
import { all, AppError, get, run, transaction } from "./db";

export const sessionCookie = "zapsters_session";
const lifetime = 60 * 60 * 8;
const windowMs = 15 * 60 * 1000;
const fingerprint = (token: string) => createHash("sha256").update(token).digest("hex");
export function assertLocalOrigin(request: Request) {
  if (!demoEnabled()) throw new AppError("The local demo adapter is disabled.",503);
  const source = request.headers.get("origin");
  const expected = process.env.ERP_ORIGIN;
  const url = new URL(request.url);
  if (!source || (expected ? source !== expected : source !== url.origin)
    || !["localhost","127.0.0.1","[::1]"].includes(new URL(source).hostname)) {
    throw new AppError("Open the app at the configured local URL to make changes.",403);
  }
}
export async function actorForSession(): Promise<Actor | null> {
  if (!demoEnabled()) return null;
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const actor = get<Omit<Actor,"permissions">>(`
    SELECT u.id,u.company_id AS companyId,u.email,u.name,ra.role_id AS role,c.name AS company,c.currency,
           e.id AS employeeId,e.department_id AS departmentId
    FROM sessions s JOIN users u ON u.id=s.user_id JOIN companies c ON c.id=u.company_id
    JOIN role_assignments ra ON ra.user_id=u.id
    LEFT JOIN employees e ON e.user_id=u.id AND e.company_id=u.company_id
    WHERE s.token_hash=? AND s.expires_at>? AND (e.id IS NULL OR e.active=1)`,fingerprint(token),Date.now());
  if (!actor) return null;
  const permissions = all<{permission_id: string}>("SELECT permission_id FROM role_permissions WHERE role_id=?",actor.role);
  return {...actor,permissions:permissions.map(entry=>entry.permission_id)};
}
export function requirePermission(actor: Actor, permission: string) {
  if (!can(actor,permission)) throw new AppError("Your role does not allow this action.",403);
}
export function requireModule(actor: Actor, module: Module) {
  if (!canOpen(actor,module)) throw new AppError("This workspace is unavailable to your role.",403);
}
export async function requireActor() {
  const actor = await actorForSession();
  if (!actor) throw new AppError("Sign in to continue.",401);
  return actor;
}
export function signIn(email: string, password: string, oldToken?: string) {
  const now = Date.now();
  const limited = transaction(() => {
    run("DELETE FROM login_limits WHERE expires_at<=?",now);
    const attempts = get<{attempts: number}>("SELECT attempts FROM login_limits WHERE email=?",email)?.attempts ?? 0;
    if (attempts>=8) return true;
    run(`INSERT INTO login_limits(email,attempts,expires_at) VALUES(?,1,?)
         ON CONFLICT(email) DO UPDATE SET attempts=attempts+1`,email,now+windowMs);
    return false;
  });
  if (limited) throw new AppError("Too many attempts. Try again in 15 minutes.",429);
  const user = get<{id:number; password_hash:string; active:number}>(`
    SELECT u.id,u.password_hash,COALESCE(e.active,1) AS active FROM users u
    JOIN role_assignments ra ON ra.user_id=u.id LEFT JOIN employees e ON e.user_id=u.id AND e.company_id=u.company_id
    WHERE u.email=?`,email);
  if (!verifyPassword(password,user?.password_hash) || !user?.active) throw new AppError("Check your email and password.",401);
  const token = randomBytes(32).toString("hex");
  transaction(() => {
    if (oldToken) run("DELETE FROM sessions WHERE token_hash=?",fingerprint(oldToken));
    run("DELETE FROM sessions WHERE expires_at<=?",now);
    run("DELETE FROM login_limits WHERE email=?",email);
    run("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",fingerprint(token),user.id,now+lifetime*1000);
  });
  return {token,lifetime};
}
export function signOut(token?: string) {
  if (token) run("DELETE FROM sessions WHERE token_hash=?",fingerprint(token));
}
