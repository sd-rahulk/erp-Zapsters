import { hashPassword } from "./password.mjs";
import { transaction } from "./sqlite.mjs";

export const demoPassword = "Zapsters-demo-2026!";
const profiles = [
  ["Admin", "Jordan Blake", "admin"], ["Manager", "Maya Chen", "manager"],
  ["HR", "Olivia Park", "hr"], ["Finance", "Daniel Brooks", "finance"],
  ["Inventory", "Ravi Mehta", "inventory"], ["Employee", "Sofia Torres", "employee"],
  ["Manager", "Ethan Reed", "director"],
];
const personal = ["employees.read", "leave.read", "leave.submit", "purchasing.read", "purchasing.submit"];
const rolePermissions = {
  Admin: ["users.manage", "settings.manage", "audit.read"],
  Manager: [...personal,"leave.decide","purchasing.decide","orders.create","reports.read"],
  HR: [...personal,"employees.manage","reports.read"],
  Finance: [...personal,"orders.read","orders.create","invoices.manage","reports.read","suppliers.read"],
  Inventory: [...personal,"inventory.manage","orders.read","orders.receive","suppliers.read","suppliers.manage","reports.read"],
  Employee: personal,
};

export function seed(db) {
  transaction(db, () => {
    if (db.prepare("SELECT id FROM companies LIMIT 1").get()) return;
    const run = (sql,...args) => db.prepare(sql).run(...args);
    const today = new Date().toISOString().slice(0,10);
    const date = (offset) => {
      const value = new Date(today + "T00:00:00Z");
      value.setUTCDate(value.getUTCDate() + offset);
      return value.toISOString().slice(0,10);
    };
    const workdays = (offset, count) => {
      const start = new Date(date(offset) + "T00:00:00Z");
      while ([0,6].includes(start.getUTCDay())) start.setUTCDate(start.getUTCDate()+1);
      const end = new Date(start);
      for (let days = 1; days < count;) {
        end.setUTCDate(end.getUTCDate()+1);
        if (![0,6].includes(end.getUTCDay())) days++;
      }
      return [start.toISOString().slice(0,10),end.toISOString().slice(0,10)];
    };
    const stamp = (offset) => date(offset) + " 10:30:00";
    run("INSERT INTO companies(id,name) VALUES(1,'Northstar Supply Co.')");
    for (const [i,name] of ["Operations","People & Culture","Finance","Leadership"].entries()) {
      run("INSERT INTO departments VALUES(?,1,?)",i+1,name);
    }
    for (const [role, permissions] of Object.entries(rolePermissions)) {
      run("INSERT INTO roles VALUES(?,?)",role,role);
      for (const permission of permissions) {
        run("INSERT OR IGNORE INTO permissions VALUES(?)",permission);
        run("INSERT INTO role_permissions VALUES(?,?)",role,permission);
      }
    }
    for (const [i,[role,name,handle]] of profiles.entries()) {
      run("INSERT INTO users(id,company_id,email,name,password_hash) VALUES(?,1,?,?,?)",i+1,handle+"@zapsters.demo",name,hashPassword(demoPassword));
      run("INSERT INTO role_assignments(user_id,role_id) VALUES(?,?)",i+1,role);
    }
    for (const [id,user,dept,manager,name,title,email] of [
      [7,7,4,null,"Ethan Reed","Managing Director","director"], [2,2,1,7,"Maya Chen","Operations Manager","manager"],
      [3,3,2,7,"Olivia Park","People Operations Lead","hr"], [4,4,3,7,"Daniel Brooks","Finance Lead","finance"],
      [5,5,1,2,"Ravi Mehta","Inventory Coordinator","inventory"], [6,6,1,2,"Sofia Torres","Operations Associate","employee"],
      [8,null,1,2,"Amelia Grant","Procurement Associate","amelia"], [9,null,1,2,"Noah Williams","Warehouse Associate","noah"],
      [10,null,1,2,"Isla Bennett","Operations Analyst","isla"], [11,null,1,2,"Leo Martin","Logistics Coordinator","leo"],
    ]) {
      run("INSERT INTO employees(id,company_id,user_id,department_id,manager_id,name,title,email) VALUES(?,1,?,?,?,?,?,?)",id,user,dept,manager,name,title,email+"@zapsters.demo");
    }
    run("INSERT INTO leave_types VALUES(1,1,'Annual leave',20),(2,1,'Sick leave',10),(3,1,'Personal leave',5)");
    for (const employee of [2,3,4,5,6,7,8,9,10,11]) {
      for (const year of [Number(today.slice(0,4)),Number(today.slice(0,4))+1]) {
        run("INSERT INTO leave_balances(employee_id,type_id,year,remaining) VALUES(?,1,?,?),(?,2,?,10),(?,3,?,5)",
          employee,year,employee===6 && year===Number(today.slice(0,4)) ? 18 : 20,employee,year,employee,year);
      }
    }
    for (const [id,employee,type,offset,days,reason,status,age] of [
      [101,6,1,8,3,"Family trip planned for next week.","Pending",-1],
      [102,5,2,3,1,"Scheduled medical appointment.","Pending",-2],
      [103,6,1,-12,2,"Family commitments.","Approved",-18],
      [104,8,3,-3,1,"Personal appointment.","Rejected",-6],
      [105,10,1,16,2,"Travel for a family event.","Pending",-3],
    ]) {
      const [start,end] = workdays(offset,days);
      const decided = status !== "Pending";
      const denial = status === "Rejected" ? "Coverage is required for the scheduled stocktake." : null;
      run("INSERT INTO leave_requests(id,company_id,employee_id,manager_id,type_id,start_date,end_date,days,reason,status,decided_by,decided_at,decision_reason,created_at,updated_at) VALUES(?,1,?,2,?,?,?,?,?,?,?,?,?,?,?)",
        id,employee,type,start,end,days,reason,status,decided ? 2 : null,decided ? stamp(age+1) : null,denial,stamp(age),stamp(decided?age+1:age));
      run("INSERT INTO audit_events(company_id,actor_id,action,entity,entity_id,after_json,created_at) VALUES(1,?,'Submitted','leave',?,?,?)",
        employee===5 ? 5 : employee===6 ? 6 : 2,id,JSON.stringify({status:"Pending"}),stamp(age));
      if (decided) run("INSERT INTO audit_events(company_id,actor_id,action,entity,entity_id,before_json,after_json,created_at) VALUES(1,2,?,'leave',?,'{\"status\":\"Pending\"}',?,?)",
        status,id,JSON.stringify({status,reason:denial}),stamp(age+1));
    }
    run("INSERT INTO suppliers(id,company_id,name,email,category) VALUES(1,1,'Apex Industrial','orders@apex.example','Equipment'),(2,1,'Meridian Office Co.','sales@meridian.example','Office supplies'),(3,1,'Atlas Packaging','desk@atlas.example','Packaging'),(4,1,'Fieldwork Safety','orders@fieldwork.example','Safety')");
    run("INSERT INTO warehouses(id,company_id,name) VALUES(1,1,'Central Warehouse'),(2,1,'Dispatch Annex')");
    for (const [i,sku,name,category,cost,reorder,quantity] of [
      [1,"EQ-104","Handheld barcode scanner","Equipment",24500,8,6],[2,"PK-210","Kraft shipping carton","Packaging",245,70,184],
      [3,"PK-212","Thermal shipping labels","Packaging",1850,20,14],[4,"OF-310","Industrial label printer","Equipment",32800,5,9],
      [5,"SF-420","Cut-resistant work gloves","Safety",1695,25,64],[6,"OF-332","Adjustable monitor arm","Office supplies",8900,10,22],
      [7,"PK-214","Reinforced packing tape","Packaging",525,25,91],[8,"SF-431","High-visibility vest","Safety",1295,20,16],
    ]) {
      run("INSERT INTO products(id,company_id,sku,name,category,unit_cost_minor,reorder_point) VALUES(?,1,?,?,?,?,?)",i,sku,name,category,cost,reorder);
      for (const [warehouse,opening] of [[1,quantity],[2,i%2===0 ? 6 : 0]]) {
        if (!opening) continue;
        run("INSERT INTO stock_levels(warehouse_id,product_id,quantity) VALUES(?,?,?)",warehouse,i,opening);
        run("INSERT INTO stock_movements(company_id,warehouse_id,product_id,actor_id,kind,delta,note,created_at) VALUES(1,?,?,5,'Opening stock',?,'Initial count',?)",warehouse,i,opening,stamp(-40));
      }
    }
    for (const [id,employee,supplier,status,reason,lines,age] of [
      [201,6,1,"Pending","Replace worn scanners at the inbound stations.",[[1,4],[4,1]],-1],
      [202,5,3,"Pending","Restock supplies for next month’s dispatch volume.",[[2,200],[3,24]],-3],
      [203,8,4,"Approved","Replenish protective gloves for the warehouse team.",[[5,40]],-5],
      [204,6,3,"Partially Received","Replenish shipping labels for the dispatch floor.",[[3,30]],-8],
      [205,9,2,"Ordered","Equip the new operations workstations.",[[6,12]],-7],
      [206,8,null,"Rejected","Upgrade the packing stations before the next stocktake.",[[4,3]],-18],
    ]) {
      const decided = status !== "Pending";
      const denial = status === "Rejected" ? "Wait for the equipment review." : null;
      run("INSERT INTO purchase_requests(id,company_id,employee_id,manager_id,supplier_id,reason,status,decided_by,decided_at,decision_reason,created_at,updated_at) VALUES(?,1,?,2,?,?,?,?,?,?,?,?)",
        id,employee,supplier,reason,status,decided?2:null,decided?stamp(age+1):null,denial,stamp(age),stamp(decided?age+1:age));
      for (const [product,qty] of lines) run("INSERT INTO purchase_request_lines(request_id,product_id,quantity,unit_cost_minor) SELECT ?,id,?,unit_cost_minor FROM products WHERE id=?",id,qty,product);
      run("INSERT INTO audit_events(company_id,actor_id,action,entity,entity_id,after_json,created_at) VALUES(1,?,'Submitted','purchasing',?,?,?)",
        employee===5 ? 5 : employee===6 ? 6 : 2,id,JSON.stringify({status:"Pending"}),stamp(age));
      if (decided) run("INSERT INTO audit_events(company_id,actor_id,action,entity,entity_id,before_json,after_json,created_at) VALUES(1,2,?,'purchasing',?,'{\"status\":\"Pending\"}',?,?)",
        denial ? "Rejected" : "Approved",id,JSON.stringify({status:denial?"Rejected":"Approved",reason:denial}),stamp(age+1));
      if (["Ordered","Partially Received"].includes(status)) {
        const orderId = id-204+301;
        run("INSERT INTO purchase_orders(id,company_id,request_id,supplier_id,status,created_by,created_at,updated_at) VALUES(?,1,?,?,?,2,?,?)",orderId,id,supplier,status,stamp(age+2),stamp(age+2));
        run("INSERT INTO purchase_order_lines(order_id,product_id,quantity,unit_cost_minor) SELECT ?,product_id,quantity,unit_cost_minor FROM purchase_request_lines WHERE request_id=?",orderId,id);
        run("INSERT INTO audit_events(company_id,actor_id,action,entity,entity_id,after_json,created_at) VALUES(1,2,'Purchase order issued','purchasing',?,?,?)",id,JSON.stringify({orderId,status:"Ordered"}),stamp(age+2));
      }
    }
    run("INSERT INTO goods_receipts(id,company_id,order_id,warehouse_id,actor_id,note,operation_key,created_at) VALUES(401,1,301,1,5,'First delivery from Atlas Packaging','seed-receipt-401',?)",stamp(-4));
    run("INSERT INTO goods_receipt_lines SELECT 401,id,10 FROM purchase_order_lines WHERE order_id=301");
    run("UPDATE stock_levels SET quantity=quantity+10 WHERE warehouse_id=1 AND product_id=3");
    run("INSERT INTO stock_movements(company_id,warehouse_id,product_id,actor_id,receipt_id,kind,delta,note,created_at) VALUES(1,1,3,5,401,'Receipt',10,'First delivery from Atlas Packaging',?)",stamp(-4));
    run("INSERT INTO audit_events(company_id,actor_id,action,entity,entity_id,after_json,created_at) VALUES(1,5,'Goods received','purchasing',204,?,?)",JSON.stringify({receiptId:401,status:"Partially Received"}),stamp(-4));
    run("INSERT INTO customers(id,company_id,name,email) VALUES(1,1,'Cedar & Finch Retail','billing@cedarfinch.example'),(2,1,'Horizon Fulfillment','accounts@horizon.example')");
    run("INSERT INTO sales_orders(id,company_id,customer_id,status,created_at) VALUES(501,1,1,'Completed',?),(502,1,2,'Open',?)",stamp(-16),stamp(-4));
    run("INSERT INTO sales_order_lines VALUES(501,2,100,320),(501,5,20,2195),(502,1,4,32000),(502,3,12,2390)");
    for (const [product,quantity] of [[2,100],[5,20]]) {
      run("UPDATE stock_levels SET quantity=quantity-? WHERE warehouse_id=1 AND product_id=?",quantity,product);
      run("INSERT INTO stock_movements(company_id,warehouse_id,product_id,actor_id,kind,delta,note,created_at,sales_order_id) VALUES(1,1,?,5,'Sale',?,'SO-0501 · Cedar & Finch Retail',?,501)",product,-quantity,stamp(-15));
    }
    run("INSERT INTO invoices(id,company_id,sales_order_id,customer_id,kind,status,total_minor,due_date,created_at) VALUES(601,1,501,1,'Receivable','Paid',75900,?,?),(602,1,502,2,'Receivable','Open',156680,?,?)",date(-2),stamp(-15),date(18),stamp(-4));
    run("INSERT INTO invoices(id,company_id,purchase_order_id,supplier_id,kind,status,total_minor,due_date,created_at) VALUES(603,1,301,3,'Payable','Open',55500,?,?)",date(9),stamp(-4));
    run("INSERT INTO payments(invoice_id,actor_id,amount_minor,reference,created_at) VALUES(601,4,75900,'ACH-72904',?)",stamp(-3));
    for (const [user,message,module,id,age] of [
      [2,"Sofia Torres submitted an annual leave request.","leave",101,-1],
      [2,"Ravi Mehta submitted a purchase request for dispatch supplies.","purchasing",202,-3],
      [2,"A partial delivery was recorded for PO-0301.","purchasing",204,-4],
      [6,"Your annual leave request was approved.","leave",103,-17],
      [5,"PO-0301 is awaiting the remaining shipment.","orders",301,-4],
    ]) run("INSERT INTO notifications(company_id,user_id,message,module,entity_id,created_at) VALUES(1,?,?,?,?,?)",user,message,module,id,stamp(age));
  });
}
