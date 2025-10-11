// // src/repositories.ts
// import pool from "./db";
// // import { Repo } from "./types/repo";

// export async function insertRepository(repo: Repo) {
//   const query = `
//     INSERT INTO repositories (
//       id, name, full_name, owner, description, url, homepage_url, is_fork,
//       primary_language, stargazers_count, forks_count, watchers_count,
//       issues_count, license, topics, created_at, updated_at, pushed_at
//     )
//     VALUES (
//       $1, $2, $3, $4, $5, $6, $7, $8,
//       $9, $10, $11, $12,
//       $13, $14, $15, $16, $17, $18
//     )
//     ON CONFLICT (id) DO UPDATE SET
//       name = EXCLUDED.name,
//       full_name = EXCLUDED.full_name,
//       owner = EXCLUDED.owner,
//       description = EXCLUDED.description,
//       url = EXCLUDED.url,
//       homepage_url = EXCLUDED.homepage_url,
//       is_fork = EXCLUDED.is_fork,
//       primary_language = EXCLUDED.primary_language,
//       stargazers_count = EXCLUDED.stargazers_count,
//       forks_count = EXCLUDED.forks_count,
//       watchers_count = EXCLUDED.watchers_count,
//       issues_count = EXCLUDED.issues_count,
//       license = EXCLUDED.license,
//       topics = EXCLUDED.topics,
//       created_at = EXCLUDED.created_at,
//       updated_at = EXCLUDED.updated_at,
//       pushed_at = EXCLUDED.pushed_at;
//   `;

//   const values = [
//     repo.github_id,
//     repo.name,
//     repo.full_name,
//     repo.owner_login,
//     repo.description,
//     repo.html_url,
//     repo.homepage_url,
//     repo.is_fork,
//     repo.language,
//     repo.stars_count,
//     repo.forks_count,
//     repo.watchers_count,
//     repo.open_issues_count,
//     repo.license,
//     repo.topics, // array
//     repo.created_at,
//     repo.updated_at,
//     repo.pushed_at,
//   ];

//   await pool.query(query, values);
// }
