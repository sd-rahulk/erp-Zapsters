import type { Actor } from "@/lib/types";
import type { Command } from "./validation";
import { run, transaction } from "./db";
import { decideLeave, submitLeave } from "./leave";
import { decidePurchase, issueOrder, receiveOrder, submitPurchase } from "./purchasing";
import { adjustStock, saveProduct } from "./stock";
import { createUser, saveEmployee, saveSettings, saveSupplier, updateRole } from "./administration";
import { updateInvoice } from "./finance";

export function executeCommand(actor: Actor, command: Command) {
  return transaction(() => {
    switch(command.action) {
      case "leave.submit": return submitLeave(actor,command);
      case "leave.decide": return decideLeave(actor,command);
      case "purchase.submit": return submitPurchase(actor,command);
      case "purchase.decide": return decidePurchase(actor,command);
      case "order.create": return issueOrder(actor,command);
      case "order.receive": return receiveOrder(actor,command);
      case "stock.adjust": return adjustStock(actor,command);
      case "product.save": return saveProduct(actor,command);
      case "supplier.save": return saveSupplier(actor,command);
      case "employee.save": return saveEmployee(actor,command);
      case "invoice.update": return updateInvoice(actor,command);
      case "user.create": return createUser(actor,command);
      case "role.update": return updateRole(actor,command);
      case "settings.update": return saveSettings(actor,command.name);
      case "notifications.read":
        run(`UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE company_id=? AND user_id=? AND read_at IS NULL
          AND (? IS NULL OR id=?)`,actor.companyId,actor.id,command.id??null,command.id??null);
        return command.id ?? 0;
    }
  });
}
