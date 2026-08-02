import { readFileSync } from "fs";
import { resolve } from "path";
import { pool } from "../src/db/pool";

async function main() {
  const file = resolve(process.cwd(), "db", "schema.sql");
  const sql = readFileSync(file, "utf8");
  console.log("[migrate] applying db/schema.sql ...");
  await pool.query(sql);
  console.log("[migrate] done.");
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("[migrate] failed:", err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
