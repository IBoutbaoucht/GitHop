import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: Number(process.env.PGPORT),
});

pool.on('connect', () => {
  console.log("✅ Database client connected");
});

pool.on('error', (err) => {
  console.error("❌ Unexpected error on idle database client", err);
  process.exit(-1);
});

export default pool;