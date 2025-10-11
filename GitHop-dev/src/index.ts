import express from "express";
import pool from "./db";
import dotenv from "dotenv";
// import { Repo } from "./types/repo"; // assuming you created the type earlier
import path from "path";


dotenv.config();

const app = express();
app.use(express.json());

app.use(express.static(path.join(process.cwd(), "public")));

app.get("/", (req, res) => {
  res.send("🚀 API is running with PostgreSQL!");
});


app.get("/repos", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM repositories ORDER BY stars_count DESC LIMIT 50;");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch repositories" });
  }
});



const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`🌐 Server running on http://localhost:${port}`);
});



























// 🧪 TEST ROUTE
// app.post("/test-repo", async (req, res) => {
//   const testRepo: Repo = {
//     github_id: 1,
//     name: "next.js",
//     owner_login: "vercel",
//     full_name: "vercel/next.js",
//     description: "The React Framework for Production",
//     html_url: "https://github.com/vercel/next.js",
//     homepage_url: "https://nextjs.org",
//     language: "TypeScript",
//     stars_count: 120000,
//     forks_count: 25000,
//     watchers_count: 1000,
//     open_issues_count: 3000,
//     subscribers_count: 500,
//     topics: ["react", "ssr", "framework"],
//     license: "MIT",
//     is_fork: false,
//     created_at: new Date().toISOString(),
//     updated_at: new Date().toISOString(),
//     pushed_at: new Date().toISOString(),
//   };

//   try {
//     await pool.query(
//       `
//       INSERT INTO repositories (
//         github_id, name, owner_login, full_name, description, html_url,
//         homepage_url, language, stars_count, forks_count, watchers_count,
//         open_issues_count, subscribers_count, topics, license, is_fork,
//         created_at, updated_at, pushed_at
//       )
//       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
//       ON CONFLICT (github_id)
//       DO NOTHING;
//       `,
//       [
//         testRepo.github_id,
//         testRepo.name,
//         testRepo.owner_login,
//         testRepo.full_name,
//         testRepo.description,
//         testRepo.html_url,
//         testRepo.homepage_url,
//         testRepo.language,
//         testRepo.stars_count,
//         testRepo.forks_count,
//         testRepo.watchers_count,
//         testRepo.open_issues_count,
//         testRepo.subscribers_count,
//         testRepo.topics,
//         testRepo.license,
//         testRepo.is_fork,
//         testRepo.created_at,
//         testRepo.updated_at,
//         testRepo.pushed_at,
//       ]
//     );

//     const { rows } = await pool.query("SELECT * FROM repositories ORDER BY id DESC LIMIT 1;");
//     res.json({ success: true, inserted: rows[0] });
//   } catch (err) {
//     console.error("❌ Error inserting repo:", err);
//     res.status(500).json({ error: "Failed to insert repository" });
//   }
// });