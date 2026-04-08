/* index.ts — Client Neon PostgreSQL + Drizzle ORM instance. Esporta `db` usato da tutte le API routes. */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
