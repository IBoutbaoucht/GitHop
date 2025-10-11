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

pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch((err : Error) => console.error("❌ Database connection error:", err));

export default pool;
