import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "./index";

const folder = new URL("../migrations", import.meta.url).pathname;
console.log("[db] running migrations from", folder);
await migrate(db, { migrationsFolder: folder });
console.log("[db] migrations done");
await sql.end();
