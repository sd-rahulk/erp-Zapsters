import { z } from "zod";
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const qty = z.number().int().min(1).max(100000);
const text = (min = 1, max = 800) => z.string().trim().min(min).max(max);
const date = z.iso.date();
const note = z.string().trim().max(800).optional();
const kind = z.enum(["Approved","Rejected"]);
const operation = z.uuid();
const uniqueLines = <T extends string>(key: T) => (lines: Record<T,number>[]) => new Set(lines.map(line=>line[key])).size===lines.length;
export const commandSchema = z.discriminatedUnion("action",[
  z.object({action:z.literal("leave.submit"),typeId:id,start:date,end:date,reason:text(4)}),
  z.object({action:z.literal("leave.decide"),id,outcome:kind,reason:note}),
  z.object({action:z.literal("purchase.submit"),supplierId:id.nullable(),reason:text(4),operation,
    lines:z.array(z.object({productId:id,quantity:qty})).min(1).max(25).refine(uniqueLines("productId"),"Select each product only once.")}),
  z.object({action:z.literal("purchase.decide"),id,outcome:kind,reason:note}),
  z.object({action:z.literal("order.create"),id,supplierId:id.optional()}),
  z.object({action:z.literal("order.receive"),id,warehouseId:id,note,operation,
    lines:z.array(z.object({lineId:id,quantity:qty})).min(1).max(25).refine(uniqueLines("lineId"),"Receive each order line only once.")}),
  z.object({action:z.literal("stock.adjust"),productId:id,warehouseId:id,delta:z.number().int().min(-100000).max(100000).refine(n=>n!==0,"Enter a nonzero quantity."),note:text(4),operation}),
  z.object({action:z.literal("product.save"),id:id.optional(),sku:text(2,32),name:text(2,90),category:text(2,40),cost:z.string().trim().regex(/^\d{1,7}(\.\d{1,2})?$/,"Use a price with up to two decimal places."),reorder:z.number().int().min(0).max(100000)}),
  z.object({action:z.literal("supplier.save"),id:id.optional(),name:text(2,90),email:z.email().max(150),category:text(2,40)}),
  z.object({action:z.literal("employee.save"),id:id.optional(),name:text(2,90),email:z.email().max(150),title:text(2,90),departmentId:id,managerId:id.nullable(),active:z.boolean()}),
  z.object({action:z.literal("invoice.update"),id,outcome:z.enum(["Paid","Void"]),reason:text(3,200)}),
  z.object({action:z.literal("user.create"),name:text(2,90),email:z.email().max(150),password:z.string().min(12).max(128),role:z.enum(["Admin","Manager","HR","Finance","Inventory","Employee"])}),
  z.object({action:z.literal("role.update"),id,role:z.enum(["Admin","Manager","HR","Finance","Inventory","Employee"])}),
  z.object({action:z.literal("settings.update"),name:text(2,90)}),
  z.object({action:z.literal("notifications.read"),id:id.optional()}),
]);
export type Command = z.infer<typeof commandSchema>;
