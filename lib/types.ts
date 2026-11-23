export type Module = "dashboard" | "employees" | "leave" | "inventory" | "movements" | "suppliers" | "purchasing" | "orders" | "sales" | "invoices" | "reports" | "users" | "audit" | "settings" | "notifications";
export type Role = "Admin" | "Manager" | "HR" | "Finance" | "Inventory" | "Employee";
export type Scalar = string | number | null;
export type Row = Record<string, Scalar>;
export type Actor = {
  id: number; companyId: number; employeeId: number | null; departmentId: number | null;
  email: string; name: string; role: Role; company: string; currency: string; permissions: string[];
};
export type Option = { id: number | string; name: string };
export type Dataset = {
  rows: Row[]; total: number; page: number; options: Record<string, Option[]>;
  detail?: { record: Row; lines: Row[]; related: Row[]; history: Row[]; actions: string[] };
};
export type Metric = { label: string; value: string | number; note: string; icon: string; href: Module };
export type DashboardData = {
  metrics: Metric[]; queue: Row[]; updates: Row[];
  chart: { label: string; leave: number; purchase: number }[];
};
export const pageSize = 10;
export const modules: Record<Module,{ title: string; permission?: string[]; description: string }> = {
  dashboard: {title:"Overview",description:"A snapshot of your workspace and the work that needs your attention."},
  employees: {title:"Employees",permission:["employees.read"],description:"Employee profiles, reporting lines, and current availability."},
  leave: {title:"Leave requests",permission:["leave.read"],description:"Submit time off, review requests, and track leave balances."},
  inventory: {title:"Stock items",permission:["inventory.manage"],description:"Track on-hand stock and reorder points across warehouses."},
  movements: {title:"Stock movements",permission:["inventory.manage"],description:"A ledger of receipts, stock adjustments, opening balances, and sales."},
  suppliers: {title:"Suppliers",permission:["suppliers.read"],description:"Supplier contacts and purchasing categories."},
  purchasing: {title:"Purchase requests",permission:["purchasing.read"],description:"Track requests from approval through ordering and receiving."},
  orders: {title:"Purchase orders",permission:["orders.read","orders.create"],description:"Issue approved orders and track incoming deliveries."},
  sales: {title:"Sales orders",permission:["invoices.manage"],description:"Customer orders, product lines, and linked receivables."},
  invoices: {title:"Invoices",permission:["invoices.manage"],description:"Track receivables, payables, due dates, and recorded payments. Finance MVP."},
  reports: {title:"Reports",permission:["reports.read"],description:"Operational totals for the records available to your role."},
  users: {title:"Users & roles",permission:["users.manage"],description:"Manage account access and review the permissions granted by each role."},
  audit: {title:"Audit log",permission:["audit.read"],description:"Append-only history of approvals, stock changes, and other sensitive actions."},
  settings: {title:"Settings",permission:["settings.manage"],description:"Manage your company workspace preferences."},
  notifications: {title:"Notifications",description:"Updates on the records and requests you’re involved in."},
};
export const can = (actor: Actor, permission: string) => actor.permissions.includes(permission);
export const canOpen = (actor: Actor, module: Module) =>
  !modules[module].permission || modules[module].permission.some(permission => can(actor,permission));
export const href = (module: Module) => module === "dashboard" ? "/" : "/"+module;
export const docNumber = (prefix: string, id: Scalar) => prefix+"-"+String(id).padStart(4,"0");
export const money = (minor: number, currency="USD") => new Intl.NumberFormat("en-US",{style:"currency",currency}).format(minor/100);
export const dateLabel = (date: Scalar) => date
  ? new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(new Date(String(date).slice(0,10)+"T00:00:00Z"))
  : "—";
export const prettyTime = (date: Scalar) => date
  ? new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",timeZone:"UTC",timeZoneName:"short"}).format(new Date(String(date).replace(" ","T")+"Z"))
  : "—";
