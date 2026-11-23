import { database } from "../db/sqlite.mjs";
import { seed } from "../db/seed.mjs";

const command = process.argv[2];
if (!["migrate","seed"].includes(command)) throw new Error("Use migrate or seed.");
const db = database();
if (command === "seed") seed(db);
console.log(command === "seed" ? "Demo database seeded." : "Database migrations applied.");
