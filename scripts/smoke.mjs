import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { database } from "../db/sqlite.mjs";
import { demoPassword, seed } from "../db/seed.mjs";

const folder = mkdtempSync(join(tmpdir(),"zapsters-smoke-"));
const socket = createServer();
socket.listen(0,"127.0.0.1");
await once(socket,"listening");
const port = socket.address().port;
await new Promise((resolve,reject)=>socket.close(error=>error?reject(error):resolve()));
const origin = "http://127.0.0.1:"+port;
Object.assign(process.env,{ERP_DEMO:"true",ERP_DB_PATH:join(folder,"smoke.sqlite"),ERP_ORIGIN:origin});
const db = database();
seed(db);

const next = spawn(process.execPath,[resolve("node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(port)],{
  env:process.env,stdio:["ignore","pipe","pipe"],windowsHide:true,
});
let log = "";
next.stdout.on("data",chunk=>{log+=chunk;});
next.stderr.on("data",chunk=>{log+=chunk;});
const exited = once(next,"exit");

async function response(path,{cookie,body,method="GET",source=origin}={}) {
  return fetch(origin+path,{method,redirect:"manual",headers:{
    ...(cookie?{cookie}:{}),
    ...(method!=="GET"?{origin:source,"Content-Type":"application/json"}:{}),
  },body:body===undefined?undefined:JSON.stringify(body)});
}
async function login(role) {
  const result=await response("/api/session",{method:"POST",body:{email:role+"@zapsters.demo",password:demoPassword}});
  assert.equal(result.status,200,await result.text());
  const cookie=result.headers.get("set-cookie");
  assert.match(cookie,/HttpOnly/i);
  assert.match(cookie,/SameSite=strict/i);
  return cookie.split(";")[0];
}
async function command(cookie,body,status=200) {
  const result=await response("/api/commands",{cookie,method:"POST",body});
  const data=await result.json();
  assert.equal(result.status,status,JSON.stringify({action:body.action,data}));
  return data.id;
}
async function page(path,cookie,marker) {
  const result=await response(path,{cookie});
  assert.equal(result.status,200,path);
  assert.ok((await result.text()).includes(marker),path+" should show "+marker);
}
const get=(sql,...params)=>db.prepare(sql).get(...params);
const run=(sql,...params)=>db.prepare(sql).run(...params);

try {
  let ready=false;
  for(let attempt=0;attempt<70;attempt++){
    if (next.exitCode!==null) break;
    if((await response("/sign-in").catch(()=>null))?.ok){ready=true;break;}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.ok(ready,"Start the app after running npm run build.");
  const anonymous = await response("/");
  if (anonymous.status===307) assert.equal(anonymous.headers.get("location"),"/sign-in");
  else {
    assert.equal(anonymous.status,200);
    assert.match(await anonymous.text(),/\/sign-in/);
  }
  await command(undefined,{action:"notifications.read"},401);
  assert.equal((await response("/api/session",{method:"POST",source:"https://outside.example",body:{}})).status,403);
  const [employee,manager,inventory,finance,admin,hr,director]=await Promise.all(
    ["employee","manager","inventory","finance","admin","hr","director"].map(login));
  for (const cookie of [employee,manager,inventory,finance,admin,hr,director]) await page("/",cookie,"Overview");
  await page("/employees",admin,"Workspace restricted");
  await page("/leave/102",employee,"Record unavailable");
  await page("/purchasing/203",employee,"Record unavailable");
  await page("/leave/101",director,"Record unavailable");
  await page("/employees/6",employee,"Leave balances");
  await page("/audit",admin,"Audit log");
  await page("/sales/501",finance,"Recent stock movements");
  await page("/suppliers",inventory,"Apex Industrial");
  await page("/reports",manager,"Pending purchases");
  assert.doesNotMatch(await (await response("/")).text(),/Sofia Torres/);
  console.log("PASS authentication, origin checks, role scoping, and module rendering");

  // Use a weekday today when possible so availability can be checked after approval.
  const start = new Date();
  while ([0,6].includes(start.getUTCDay())) start.setUTCDate(start.getUTCDate()+1);
  const iso=start.toISOString().slice(0,10);
  const year=Number(iso.slice(0,4));
  const leave = await command(employee,{action:"leave.submit",typeId:2,start:iso,end:iso,reason:"Medical appointment for smoke test."});
  await command(employee,{action:"leave.submit",typeId:2,start:iso,end:iso,reason:"Duplicate dates."},409);
  await command(employee,{action:"leave.decide",id:leave,outcome:"Approved"},403);
  await command(director,{action:"leave.decide",id:leave,outcome:"Approved"},403);
  const before=get("SELECT remaining FROM leave_balances WHERE employee_id=6 AND type_id=2 AND year=?",year).remaining;
  const decisions=await Promise.all([1,2].map(()=>response("/api/commands",{cookie:manager,method:"POST",body:{action:"leave.decide",id:leave,outcome:"Approved"}})));
  assert.deepEqual(decisions.map(result=>result.status).sort(),[200,409]);
  assert.equal(get("SELECT status FROM leave_requests WHERE id=?",leave).status,"Approved");
  assert.equal(get("SELECT remaining FROM leave_balances WHERE employee_id=6 AND type_id=2 AND year=?",year).remaining,before-1);
  assert.equal(get("SELECT count(*) n FROM audit_events WHERE entity='leave' AND entity_id=? AND action='Approved'",leave).n,1);
  if (iso===new Date().toISOString().slice(0,10)) await page("/employees/6",employee,"On leave");
  await command(manager,{action:"leave.decide",id:102,outcome:"Rejected"},400);
  await command(manager,{action:"leave.decide",id:102,outcome:"Rejected",reason:"Coverage is needed."});
  assert.equal(get("SELECT remaining FROM leave_balances WHERE employee_id=5 AND type_id=2 AND year=?",year).remaining,10);
  await page("/leave/"+leave,employee,"Activity history");
  const ownLeave=await command(manager,{action:"leave.submit",typeId:1,start:iso,end:iso,reason:"Manager appointment."});
  await command(manager,{action:"leave.decide",id:ownLeave,outcome:"Approved"},403);
  await command(director,{action:"leave.decide",id:ownLeave,outcome:"Rejected",reason:"Needs to be rescheduled."});
  console.log("PASS leave submission, approval race, single debit, rejection and active availability");

  run("INSERT INTO companies(id,name) VALUES(2,'Separated company')");
  run("INSERT INTO products(id,company_id,sku,name,category,unit_cost_minor,reorder_point) VALUES(99,2,'PRIVATE','Private item','Safety',1,0)");
  const submit = {action:"purchase.submit",supplierId:null,reason:"Replace damaged tape dispensers and scanners.",operation:randomUUID(),
    lines:[{productId:1,quantity:4},{productId:7,quantity:2}]};
  await command(employee,{...submit,lines:[{productId:99,quantity:1}]},404);
  const requestId=await command(employee,submit);
  assert.equal(await command(employee,submit),requestId);
  await command(employee,{action:"purchase.decide",id:requestId,outcome:"Approved"},403);
  await command(finance,{action:"purchase.decide",id:requestId,outcome:"Approved"},403);
  await command(manager,{action:"purchase.decide",id:requestId,outcome:"Approved"});
  await command(manager,{action:"order.create",id:requestId},400);
  const orderId=await command(manager,{action:"order.create",id:requestId,supplierId:1});
  await command(manager,{action:"order.create",id:requestId,supplierId:1},409);
  const orderLines=db.prepare("SELECT id,product_id FROM purchase_order_lines WHERE order_id=? ORDER BY id").all(orderId);
  const [scanner,tape]=orderLines;
  const total=()=>get("SELECT quantity FROM stock_levels WHERE product_id=1 AND warehouse_id=1").quantity;
  const opening=total();
  const receipt={action:"order.receive",id:orderId,warehouseId:1,operation:randomUUID(),
    lines:[{lineId:scanner.id,quantity:2}],note:"First shipment"};
  await command(manager,receipt,403);
  await command(inventory,{...receipt,lines:[{lineId:scanner.id,quantity:5}]},409);
  assert.equal(total(),opening);
  const firstReceipt=await command(inventory,receipt);
  assert.equal(await command(inventory,receipt),firstReceipt);
  assert.equal(total(),opening+2);
  assert.equal(get("SELECT status FROM purchase_orders WHERE id=?",orderId).status,"Partially Received");
  await page("/orders/"+orderId,inventory,"First shipment");
  await command(inventory,{...receipt,operation:randomUUID(),lines:[{lineId:scanner.id,quantity:2},{lineId:tape.id,quantity:2}]});
  assert.equal(total(),opening+4);
  assert.equal(get("SELECT status FROM purchase_requests WHERE id=?",requestId).status,"Received");
  assert.equal(get("SELECT count(*) n FROM stock_movements WHERE receipt_id=?",firstReceipt).n,1);
  await command(inventory,{action:"stock.adjust",productId:1,warehouseId:1,delta:-100000,note:"Invalid negative stock adjustment.",operation:randomUUID()},409);
  assert.equal(total(),opening+4);
  await command(manager,{action:"purchase.decide",id:202,outcome:"Rejected",reason:"Existing stock is sufficient."});
  await page("/purchasing/"+requestId,employee,"Goods receipts");
  console.log("PASS purchase approval, order creation, atomic partial/full receipts, retry safety, negative stock guard");

  await command(finance,{action:"invoice.update",id:602,outcome:"Paid",reason:"BANK-TEST-602"});
  await command(finance,{action:"invoice.update",id:602,outcome:"Void",reason:"Test duplicate update."},409);
  assert.equal(get("SELECT amount_minor FROM payments WHERE invoice_id=602").amount_minor,156680);
  await page("/invoices/602",finance,"BANK-TEST-602");
  await command(admin,{action:"role.update",id:1,role:"Employee"},403);
  await command(admin,{action:"role.update",id:6,role:"Inventory"});
  await command(employee,{action:"notifications.read"},401);
  assert.equal(get("SELECT role_id FROM role_assignments WHERE user_id=6").role_id,"Inventory");
  await page("/employees",hr,"Noah Williams");
  assert.throws(()=>run("UPDATE audit_events SET action='Modified' WHERE id=(SELECT MIN(id) FROM audit_events)"),/append-only/);
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
  console.log("PASS invoice payment, role changes, session invalidation, immutable audit log, and foreign keys");
} catch (error) {
  console.error(log.trim());
  throw error;
} finally {
  if (next.exitCode===null) {next.kill();await exited;}
  db.close();
  for (const file of ["smoke.sqlite","smoke.sqlite-wal","smoke.sqlite-shm"]) rmSync(join(folder,file),{force:true});
  rmdirSync(folder);
}
