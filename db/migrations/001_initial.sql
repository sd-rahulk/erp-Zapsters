CREATE TABLE companies (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency IN ('USD','EUR','GBP','INR')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE departments (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies, name TEXT NOT NULL,
  UNIQUE(company_id,name)
);
CREATE TABLE users (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies, email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE roles (id TEXT PRIMARY KEY, label TEXT NOT NULL);
CREATE TABLE permissions (id TEXT PRIMARY KEY);
CREATE TABLE role_permissions (
  role_id TEXT NOT NULL REFERENCES roles, permission_id TEXT NOT NULL REFERENCES permissions,
  PRIMARY KEY(role_id,permission_id)
);
CREATE TABLE role_assignments (
  user_id INTEGER PRIMARY KEY REFERENCES users, role_id TEXT NOT NULL REFERENCES roles,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users, expires_at INTEGER NOT NULL
);
CREATE INDEX session_expiry ON sessions(expires_at);
CREATE TABLE login_limits (
  email TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE employees (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies, user_id INTEGER UNIQUE REFERENCES users,
  department_id INTEGER NOT NULL REFERENCES departments, manager_id INTEGER REFERENCES employees,
  name TEXT NOT NULL, title TEXT NOT NULL, email TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,email), CHECK(manager_id IS NULL OR manager_id != id)
);
CREATE INDEX employee_team ON employees(company_id,manager_id,department_id);
CREATE TABLE leave_types (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies, name TEXT NOT NULL,
  entitlement INTEGER NOT NULL CHECK(entitlement>=0), UNIQUE(company_id,name)
);
CREATE TABLE leave_balances (
  employee_id INTEGER NOT NULL REFERENCES employees, type_id INTEGER NOT NULL REFERENCES leave_types, year INTEGER NOT NULL,
  remaining INTEGER NOT NULL CHECK(remaining>=0), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(employee_id,type_id,year)
);
CREATE TABLE leave_requests (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies, employee_id INTEGER NOT NULL REFERENCES employees,
  manager_id INTEGER NOT NULL REFERENCES employees, type_id INTEGER NOT NULL REFERENCES leave_types, start_date TEXT NOT NULL,
  end_date TEXT NOT NULL, days INTEGER NOT NULL CHECK(days>0), reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('Pending','Approved','Rejected')), decided_by INTEGER REFERENCES users,
  decided_at TEXT, decision_reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK(end_date>=start_date)
);
CREATE INDEX leave_scope ON leave_requests(company_id,manager_id,status);
CREATE INDEX leave_overlap ON leave_requests(employee_id,start_date,end_date,status);
CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies, name TEXT NOT NULL, email TEXT NOT NULL,
  category TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(company_id,name)
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies, sku TEXT NOT NULL, name TEXT NOT NULL,
  category TEXT NOT NULL, unit_cost_minor INTEGER NOT NULL CHECK(unit_cost_minor>=0),
  reorder_point INTEGER NOT NULL CHECK(reorder_point>=0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,sku)
);
CREATE TABLE warehouses (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies, name TEXT NOT NULL, UNIQUE(company_id,name)
);
CREATE TABLE stock_levels (
  warehouse_id INTEGER NOT NULL REFERENCES warehouses, product_id INTEGER NOT NULL REFERENCES products,
  quantity INTEGER NOT NULL CHECK(quantity>=0), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(warehouse_id,product_id)
);
CREATE TABLE purchase_requests (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies, employee_id INTEGER NOT NULL REFERENCES employees,
  manager_id INTEGER NOT NULL REFERENCES employees, supplier_id INTEGER REFERENCES suppliers,
  reason TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL CHECK(status IN ('Pending','Approved','Rejected','Ordered','Partially Received','Received')),
  decided_by INTEGER REFERENCES users, decided_at TEXT, decision_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX purchase_scope ON purchase_requests(company_id,manager_id,status);
CREATE INDEX purchase_owner ON purchase_requests(employee_id);
CREATE TABLE purchase_request_lines (
  id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL REFERENCES purchase_requests, product_id INTEGER NOT NULL REFERENCES products,
  quantity INTEGER NOT NULL CHECK(quantity>0), unit_cost_minor INTEGER NOT NULL CHECK(unit_cost_minor>=0),
  UNIQUE(request_id,product_id)
);
CREATE TABLE purchase_orders (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies, request_id INTEGER NOT NULL UNIQUE REFERENCES purchase_requests,
  supplier_id INTEGER NOT NULL REFERENCES suppliers, currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL CHECK(status IN ('Ordered','Partially Received','Received')),
  created_by INTEGER NOT NULL REFERENCES users, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX orders_company ON purchase_orders(company_id,status);
CREATE TABLE purchase_order_lines (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES purchase_orders, product_id INTEGER NOT NULL REFERENCES products,
  quantity INTEGER NOT NULL CHECK(quantity>0), unit_cost_minor INTEGER NOT NULL CHECK(unit_cost_minor>=0),
  UNIQUE(order_id,product_id)
);
CREATE TABLE goods_receipts (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies, order_id INTEGER NOT NULL REFERENCES purchase_orders,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses, actor_id INTEGER NOT NULL REFERENCES users, note TEXT NOT NULL,
  operation_key TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(company_id,operation_key)
);
CREATE INDEX receipt_order ON goods_receipts(order_id);
CREATE TABLE goods_receipt_lines (
  receipt_id INTEGER NOT NULL REFERENCES goods_receipts, order_line_id INTEGER NOT NULL REFERENCES purchase_order_lines,
  quantity INTEGER NOT NULL CHECK(quantity>0), PRIMARY KEY(receipt_id,order_line_id)
);
CREATE INDEX receipt_line_order ON goods_receipt_lines(order_line_id);
CREATE TABLE stock_movements (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies, warehouse_id INTEGER NOT NULL REFERENCES warehouses,
  product_id INTEGER NOT NULL REFERENCES products, actor_id INTEGER NOT NULL REFERENCES users,
  receipt_id INTEGER REFERENCES goods_receipts, operation_key TEXT, kind TEXT NOT NULL CHECK(kind IN ('Opening stock','Receipt','Adjustment','Sale')),
  delta INTEGER NOT NULL CHECK(delta!=0), note TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,operation_key), UNIQUE(receipt_id,product_id)
);
CREATE INDEX movement_scope ON stock_movements(company_id,product_id,created_at);
CREATE TABLE customers (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies, name TEXT NOT NULL, email TEXT NOT NULL,
  UNIQUE(company_id,name)
);
CREATE TABLE sales_orders (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies, customer_id INTEGER NOT NULL REFERENCES customers,
  currency TEXT NOT NULL DEFAULT 'USD', status TEXT NOT NULL CHECK(status IN ('Open','Completed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE sales_order_lines (
  order_id INTEGER NOT NULL REFERENCES sales_orders, product_id INTEGER NOT NULL REFERENCES products,
  quantity INTEGER NOT NULL CHECK(quantity>0), unit_price_minor INTEGER NOT NULL CHECK(unit_price_minor>=0),
  PRIMARY KEY(order_id,product_id)
);
CREATE TABLE invoices (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies, sales_order_id INTEGER UNIQUE REFERENCES sales_orders,
  purchase_order_id INTEGER REFERENCES purchase_orders, customer_id INTEGER REFERENCES customers, supplier_id INTEGER REFERENCES suppliers,
  kind TEXT NOT NULL CHECK(kind IN ('Receivable','Payable')), status TEXT NOT NULL CHECK(status IN ('Open','Paid','Void')),
  total_minor INTEGER NOT NULL CHECK(total_minor>0), currency TEXT NOT NULL DEFAULT 'USD', due_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK((kind='Receivable' AND customer_id IS NOT NULL AND supplier_id IS NULL AND purchase_order_id IS NULL)
    OR (kind='Payable' AND supplier_id IS NOT NULL AND customer_id IS NULL AND sales_order_id IS NULL))
);
CREATE INDEX invoices_company ON invoices(company_id,status,due_date);
CREATE TABLE payments (
  id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL UNIQUE REFERENCES invoices, actor_id INTEGER NOT NULL REFERENCES users,
  amount_minor INTEGER NOT NULL CHECK(amount_minor>0), reference TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies, actor_id INTEGER NOT NULL REFERENCES users,
  action TEXT NOT NULL, entity TEXT NOT NULL, entity_id INTEGER NOT NULL, before_json TEXT, after_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX audit_entity ON audit_events(company_id,entity,entity_id,id);
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'Audit history is append-only'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'Audit history is append-only'); END;
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies, user_id INTEGER NOT NULL REFERENCES users,
  message TEXT NOT NULL, module TEXT NOT NULL, entity_id INTEGER NOT NULL,
  read_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX notifications_owner ON notifications(company_id,user_id,read_at,id);
