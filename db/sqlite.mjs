import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const demoEnabled = () => process.env.ERP_DEMO === "true";
let connection;

export function database() {
  if (connection) return connection;
  if (!demoEnabled()) throw new Error("Set ERP_DEMO=true to enable the local SQLite adapter.");
  const path = resolve(/* turbopackIgnore: true */ process.env.ERP_DB_PATH || "data/zapsters.sqlite");
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    migrate(db);
    connection = db;
    return connection;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function transaction(db, work) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrate(db) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)");
  const folder = resolve("db/migrations");
  for (const file of readdirSync(folder).filter(name => name.endsWith(".sql")).sort()) {
    transaction(db, () => {
      if (db.prepare("SELECT 1 FROM schema_migrations WHERE version=?").get(file)) return;
      db.exec(readFileSync(resolve(folder, file), "utf8"));
      db.prepare("INSERT INTO schema_migrations(version) VALUES(?)").run(file);
    });
  }
}
