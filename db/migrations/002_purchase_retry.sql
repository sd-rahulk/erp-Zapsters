ALTER TABLE purchase_requests ADD COLUMN operation_key TEXT;
CREATE UNIQUE INDEX request_operation_key ON purchase_requests(company_id,operation_key);
