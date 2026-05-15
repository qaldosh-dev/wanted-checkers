import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/wanted_checkers"
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function closePool() {
  await pool.end();
}
