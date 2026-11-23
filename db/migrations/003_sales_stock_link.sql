ALTER TABLE stock_movements ADD COLUMN sales_order_id INTEGER REFERENCES sales_orders(id);
CREATE INDEX movement_sales_order ON stock_movements(company_id,sales_order_id);
UPDATE stock_movements AS m SET sales_order_id=(
  SELECT s.id FROM sales_orders s WHERE s.company_id=m.company_id AND m.note LIKE ('SO-'||printf('%04d',s.id)||' · %')
) WHERE m.kind='Sale';
