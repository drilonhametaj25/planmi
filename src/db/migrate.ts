/* migrate.ts — Script per applicare migrazioni Drizzle su Neon.
   Eseguito automaticamente durante il build su Vercel.
   Su Vercel DATABASE_URL è nelle env vars.
   In locale, passare via: tsx --env-file=.env.local src/db/migrate.ts */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL non configurata");
  }

  console.log("🔄 Esecuzione migrazioni database...");

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql);

  await migrate(db, { migrationsFolder: "./drizzle" });

  console.log("✅ Migrazioni completate con successo");
}

main().catch((err) => {
  console.error("❌ Errore migrazione:", err);
  process.exit(1);
});
