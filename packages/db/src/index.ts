import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };

const url = process.env.DATABASE_URL ?? "postgres://erp:erp@localhost:5432/erp";

export const sql = postgres(url, { max: Number(process.env.DB_POOL ?? 10), onnotice: () => {} });
export const db = drizzle(sql, { schema, casing: "snake_case" });
export type DB = typeof db;
