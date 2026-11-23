# Zapsters ERP

A local ERP demo for a fictional distributor, Northstar Supply Co. Employee records drive approval routing. Approved purchase requests become purchase orders, and posted receipts update the same inventory ledger used in the stock workspace.

## Run locally

Use Node.js 22.16 or newer and npm. The demo runs on loopback and persists data in SQLite.

```powershell
Copy-Item .env.example .env
npm.cmd ci
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Use `npm` in shells where PowerShell’s npm shim restriction does not apply. On macOS or Linux, use `cp .env.example .env`. Seed is idempotent for an already populated database. To create a fresh demo, point `ERP_DB_PATH` at a new path and run the migration and seed commands again. The database is ignored by Git.

All accounts below use the public, local-only demo password `Zapsters-demo-2026!`. The sign-in screen has shortcuts for the six roles. Open the account menu in the sidebar to switch roles.

| Role | Email | Scope |
| --- | --- | --- |
| Manager | manager@zapsters.demo | Own records and Maya’s direct reports in Operations |
| Employee | employee@zapsters.demo | Sofia’s own profile, balances, and requests |
| Inventory | inventory@zapsters.demo | Company stock, suppliers, receipts, and purchase orders |
| Finance | finance@zapsters.demo | Company invoices, payments, sales orders, and purchase orders |
| HR | hr@zapsters.demo | Company employee records and leave administration |
| Admin | admin@zapsters.demo | Users, role assignments, workspace settings, and redacted audit review |
| Manager | director@zapsters.demo | Ethan’s direct reports, including Maya, Olivia, and Daniel |

### Walk through the workflows

1. **Leave.** Sign in as Employee. Submit a weekday range that does not overlap a seeded request. Switch to Manager, open the pending request, and approve or reject it. Switch back to Employee to see the decision, history, notification, and updated balance. Approved leave shows as **On leave** in the employee directory only on weekdays within the approved dates.
2. **Purchasing.** Submit a purchase request as Employee. Approve it as Manager and issue the purchase order. Sign in as Inventory to record a partial shipment, then the remaining units. The purchase order and original request track both receipts. Stock items show the new warehouse count and Stock movements shows the originating receipt.
3. **Finance.** Sign in as Finance to inspect a sales order, linked inventory movements, and its invoice. Open an unpaid invoice to record a full payment with a reference or void it with a reason. The original invoice and audit history are retained.

### Policy choices

- Leave counts weekdays, uses UTC dates, and must stay within one calendar year. Balances for the seed year and the following year are set up at seed time. Pending requests reserve capacity. Approval debits the balance atomically, and rejection leaves it unchanged. Holidays, half-days, cancellations, and automatic annual rollover are outside the demo.
- The active direct manager decides requests. HR can update reporting lines and transfer pending approvals but does not approve company-wide. Finance may issue an approved purchase order but does not approve purchase requests. Inventory records receipts and signed stock adjustments with reasons. Stock cannot go negative. Orders preserve prices when issued. Money is stored as exact integer minor units, with the currency on each monetary document.
- Admin access covers account creation, assignment of the six predefined roles, settings, and company audit metadata. Business audit details are available on authorized record pages. HR can link an employee profile to a newly created account by using its matching email. Role changes revoke existing sessions.
- Reports use the signed-in role’s scope. In-app notifications are persisted. Sales is a seeded, read-only overview, and the finance MVP tracks full payments and voids. It does not run a general ledger or an external payment integration.

## Configuration and persistence

| Variable | Meaning |
| --- | --- |
| `ERP_DEMO` | Set to `true` to opt into the local adapter and public demo fixtures. |
| `ERP_DB_PATH` | Path to the SQLite file, relative to the project directory or absolute. |
| `ERP_ORIGIN` | Exact loopback origin for sign-in and writes. Change it if you change the host or port. |

`db/migrations/` contains ordered migrations recorded in `schema_migrations`. `db/seed.mjs` inserts fictional data in one transaction. The Next.js pages read scoped data through `lib/server/`, and the commands API validates the session, origin, input, permissions, and transition before writing. The SQLite adapter uses foreign keys and immediate transactions. Sessions use hashed opaque tokens and an HTTP-only cookie.

### PostgreSQL integration path

This checkout ships the working SQLite demo adapter. To run a production database, provision PostgreSQL, keep the connection string in a server-only `DATABASE_URL`, and implement a PostgreSQL adapter for `lib/server/db.ts` using a pool with a single connection per transaction. Port and apply the ordered migrations with a separate migration identity. Use identity keys, `BIGINT` minor units or `NUMERIC` money, native dates, and `TIMESTAMPTZ`. Replace SQLite date and JSON expressions and port the audit immutability triggers. Use row locks or guarded updates for concurrent decisions and receipts. Configure managed identity or production authentication, TLS, and private access, leave demo mode off, and run the workflow and authorization checks against the production adapter before enabling traffic. Setting `DATABASE_URL` alone does not enable PostgreSQL in this checkout.

## Checks

```powershell
npm.cmd run check
npm.cmd run build
npm.cmd test
```

The smoke test starts the compiled app against a newly seeded temporary database. It checks role scoping, leave balance updates, partial and final goods receipts, stock invariants, payment status changes, role updates, and append-only audit behavior. It uses a free loopback port and leaves your demo database intact.
