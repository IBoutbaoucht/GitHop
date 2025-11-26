import express from "express";
import pool from "./db.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import githubService from "./services/githubService.js";
import workerService from './services/workerService.js';
import developerWorkerService from "./services/developerWorkerService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// =============================================================================
// HELPER: Resolve Local ID to GitHub ID
// =============================================================================

async function getGithubIdFromLocal(tableName: string, localId: number): Promise<string | null> {
  const validTables = ['tops', 'growings', 'trendings', 'repositories_index'];
  if (!validTables.includes(tableName)) return null;
  const res = await pool.query(`SELECT github_id FROM ${tableName} WHERE id = $1`, [localId]);
  if (res.rows.length === 0) return null;
  return res.rows[0].github_id;
}


// Test 

app.post('/test' , async (req, res) => {
   workerService.updateCommitActivityGrowings() ;
  res.status(202).json({ message: "Growing Repositories Fetch Started." });

})

// =============================================================================
// 1. CORE DATA FETCHING ENDPOINTS (Triggers)
// =============================================================================

app.post('/fetch-growing', async (req, res) => {
  try {
    await githubService.SaveGrowingRepositories();
    res.status(202).json({ message: "Growing Repositories Fetch Started." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/fetch-trending', async (req, res) => {
  try {
    await githubService.SaveTrendingRepositories();
    res.status(202).json({ message: "Trending Repositories Fetch Started." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/sync/quick", async (req, res) => {
  try {
    githubService.syncQuick();
    res.status(202).json({ message: "Quick sync started successfully." });
  } catch (error: any) {
    console.error("❌ Quick sync trigger error:", error);
    res.status(500).json({ error: "Failed to start quick sync", details: error.message });
  }
});

app.post("/api/sync/comprehensive", async (req, res) => {
  try {
    githubService.syncComprehensive();
    res.status(202).json({ message: "Comprehensive sync started successfully." });
  } catch (error: any) {
    console.error("❌ Comprehensive sync trigger error:", error);
    res.status(500).json({ error: "Failed to start comprehensive sync", details: error.message });
  }
});


// --- NEW: DEVELOPER SYNC TRIGGERS ---

// app.post("/fetch-top-developers", async (req, res) => {
//   try {
//     // Trigger the worker mission for "Legends"
//     developerWorkerService.runScoutingMission(); 
//     res.status(202).json({ message: "🏆 Top Developers sync started (Background Job)." });
//   } catch (error: any) {
//     console.error("❌ Error triggering top devs sync:", error);
//     res.status(500).json({ error: error.message });
//   }
// });

app.post("/api/developers/fetch", async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: "Username is required" });
    await developerWorkerService.fetchSpecificDeveloper(username);
    res.status(200).json({ message: `Successfully fetched ${username}.` });
  } catch (error: any) {
    console.error("Error manual fetch:", error);
    res.status(500).json({ error: "Failed to fetch developer" });
  }
});

// Trigger Endpoints
app.post("/api/workers/scout", async (req, res) => {
  try {
    // Triggers the full suite of missions
    developerWorkerService.runAllMissions();
    res.status(202).json({ message: "Global Developer Scouting Mission Started." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/fetch/oussama", async (req, res) => {
  try {
    // Triggers the full suite of missions
    developerWorkerService.fetchSpecificDeveloper("rakaoran");
    res.status(202).json({ message: "RakaOran Developer Scouting Mission Started." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// app.post("/fetch-rising-developers", async (req, res) => {
//   try {
//     // Trigger the worker mission for "Rising Stars"
//     developerWorkerService.syncRisingDevelopers();
//     res.status(202).json({ message: "🚀 Rising Developers sync started (Background Job)." });
//   } catch (error: any) {
//     console.error("❌ Error triggering rising devs sync:", error);
//     res.status(500).json({ error: error.message });
//   }
// });

// =============================================================================
// 2. WORKER TRIGGERS (Background Jobs)
// =============================================================================

// Generic: Update Contributors
// /api/workers/update-contributors
// /api/workers/update-contributors?repo_type=growings
// /api/workers/update-contributors?repo_type=trendings

app.post("/api/workers/update-contributors", async (req, res) => {
  const repoType = req.query.repo_type as string || 'tops';
  try {
    await workerService.updateContributors(repoType);
    res.status(202).json({ message: `Contributors update for ${repoType} started` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Specific: Update Contributors for one repo
app.post("/api/workers/:id/update-contributors", async (req, res) => {
  const repoId = parseInt(req.params.id);
  const repoType = req.query.repo_type as string || 'tops';
  try {
    await workerService.updateContributors(repoType, repoId);
    res.status(202).json({ message: `Contributors of ${repoType} ID ${repoId} updated successfully` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Generic: Update Commit Activity
app.post("/api/workers/update-commit-activity", async (req, res) => {
  const repoType = req.query.repo_type as string || 'tops';
  try {
    await workerService.updateCommitActivity(repoType);
    res.status(202).json({ message: `Commit activity update for ${repoType} started` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Generic: Update Recent Activity (Commits)
app.post("/api/workers/update-recent-activity", async (req, res) => {
  const repoType = req.query.repo_type as string || 'tops';
  try {
    await workerService.updateRecentCommits(repoType);
    res.status(202).json({ message: `Recent activity update for ${repoType} started` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Specific: Update Recent Activity for one repo
app.post("/api/repos/:id/refresh-commits", async (req, res) => {
  const repoType = req.query.repo_type as string || 'tops'; 
  const repoId = parseInt(req.params.id);
  try {
    await workerService.updateRecentCommits(repoType, repoId);
    res.status(202).json({ message: `Commits refresh started for ${repoType} ID ${repoId}` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/workers/run-all", async (req, res) => {
  try {
    workerService.runAllJobs();
    res.status(202).json({ message: "All background jobs started for all categories" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// 3. DATA READ ENDPOINTS (API)
// =============================================================================

// =============================================================================
// NEW: DEVELOPER INTELLIGENCE ENDPOINT
// =============================================================================


app.get("/api/developers", async (req, res) => {
  try {
    const { type, language, persona, limit = 50 } = req.query;

    let whereClauses = [];
    let params: any[] = [];
    let paramIdx = 1;
    let orderByClause = 'd.total_stars_earned DESC'; 

    if (type === 'rising') {
      whereClauses.push(`d.is_rising_star = TRUE`);
      orderByClause = 'd.velocity_score DESC';
    } 
    else if (type === 'expert') {
      whereClauses.push(`(d.scout_source = 'trending_expert' OR d.personas != '{}'::jsonb)`);
      if (!persona) orderByClause = 'd.total_stars_earned DESC';
    }
    else {
      whereClauses.push(`d.followers_count > 100`); 
      orderByClause = 'd.followers_count DESC'; // Hall of Fame sorting
    }

    if (language) {
      whereClauses.push(`d.dominant_language = $${paramIdx}`);
      params.push(language);
      paramIdx++;
    }

    if (persona) {
      whereClauses.push(`(d.personas->>$${paramIdx})::int > 0`);
      orderByClause = `(d.personas->>$${paramIdx})::int DESC`; 
      params.push(persona);
      paramIdx++;
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const query = `
      SELECT 
        d.*,
        COALESCE(
          json_agg(
            json_build_object(
              'name', t.name,
              'url', t.html_url,
              'stars', t.stars_count,
              'language', t.language,
              'is_primary', t.is_primary
            ) ORDER BY t.stars_count DESC
          ) FILTER (WHERE t.id IS NOT NULL), 
          '[]'
        ) as top_repos
      FROM developers d
      LEFT JOIN developer_top_repos t ON d.id = t.developer_id
      ${whereSql}
      GROUP BY d.id
      ORDER BY ${orderByClause}
      LIMIT $${paramIdx}
    `;

    params.push(limit);

    const { rows } = await pool.query(query, params);
    res.json({ data: rows });

  } catch (err) {
    console.error('Error fetching developers:', err);
    res.status(500).json({ error: "Failed to fetch developers" });
  }
});

app.get("/api/developers/:login/details", async (req, res) => {
  try {
    const { login } = req.params;
    const query = `
      SELECT 
        d.*,
        COALESCE(
          json_agg(
            json_build_object(
              'name', t.name,
              'url', t.html_url,
              'stars', t.stars_count,
              'language', t.language,
              'description', t.description,
              'is_primary', t.is_primary
            ) ORDER BY t.stars_count DESC
          ) FILTER (WHERE t.id IS NOT NULL), 
          '[]'
        ) as top_repos
      FROM developers d
      LEFT JOIN developer_top_repos t ON d.id = t.developer_id
      WHERE d.login = $1
      GROUP BY d.id
    `;

    const { rows } = await pool.query(query, [login]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Developer not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching developer details:', err);
    res.status(500).json({ error: "Failed to fetch developer details" });
  }
});



// app.get("/api/developers", async (req, res) => {
//   try {
//     const { 
//       type,       // 'top' | 'expert' | 'rising'
//       language,   
//       persona,    // <--- NEW: Filter by specific persona key (e.g., 'ai_whisperer')
//       limit = 1000 
//     } = req.query;

//     let whereClauses = [];
//     let params: any[] = [];
//     let paramIdx = 1;

//     // 1. FILTER BY CATEGORY
//     if (type === 'rising') {
//       whereClauses.push(`d.is_rising_star = TRUE`);
//     } 
//     else if (type === 'expert') {
//       whereClauses.push(`(d.scout_source = 'trending_expert' OR d.personas != '{}'::jsonb)`);
//     }
//     else {
//       // Default 'top' (Hall of Fame)
//       // UNCOMMENT THIS to make it exclusive:
//       whereClauses.push(`d.scout_source = 'hall_of_fame'`);
//     }

//     // 2. Filter by Tech Stack
//     if (language) {
//       whereClauses.push(`d.dominant_language = $${paramIdx}`);
//       params.push(language);
//       paramIdx++;
//     }

//     // 3. Filter by Persona (NEW)
//     // We check if the JSON key exists and has a score > 0
//     if (persona) {
//       whereClauses.push(`(d.personas->>$${paramIdx})::int > 0`);
//       params.push(persona);
//       paramIdx++;
//     }

//     const whereSql = whereClauses.length > 0 
//       ? 'WHERE ' + whereClauses.join(' AND ') 
//       : '';

//     const query = `
//       SELECT 
//         d.*,
//         COALESCE(
//           json_agg(
//             json_build_object(
//               'name', t.name,
//               'url', t.html_url,
//               'stars', t.stars_count,
//               'language', t.language,
//               'is_primary', t.is_primary
//             ) ORDER BY t.stars_count DESC
//           ) FILTER (WHERE t.id IS NOT NULL), 
//           '[]'
//         ) as top_repos
//       FROM developers d
//       LEFT JOIN developer_top_repos t ON d.id = t.developer_id
//       ${whereSql}
//       GROUP BY d.id
//       -- If filtering by persona, order by that persona's score to show top experts first
//       ORDER BY 
//         ${persona ? `(d.personas->>$${paramIdx-1})::int DESC,` : ''} 
//         d.total_stars_earned DESC
//       LIMIT $${paramIdx}
//     `;

//     params.push(limit);

//     const { rows } = await pool.query(query, params);
//     res.json({ data: rows });

//   } catch (err) {
//     console.error('Error fetching developers:', err);
//     res.status(500).json({ error: "Failed to fetch developers" });
//   }
// });


// // GET SINGLE DEVELOPER (Profile View)
// app.get("/api/developers/:login/details", async (req, res) => {
//   try {
//     const { login } = req.params;

//     const query = `
//       SELECT 
//         d.*,
//         COALESCE(
//           json_agg(
//             json_build_object(
//               'name', t.name,
//               'url', t.html_url,
//               'stars', t.stars_count,
//               'language', t.language,
//               'description', t.description,
//               'is_primary', t.is_primary
//             ) ORDER BY t.stars_count DESC
//           ) FILTER (WHERE t.id IS NOT NULL), 
//           '[]'
//         ) as top_repos
//       FROM developers d
//       LEFT JOIN developer_top_repos t ON d.id = t.developer_id
//       WHERE d.login = $1
//       GROUP BY d.id
//     `;

//     const { rows } = await pool.query(query, [login]);

//     if (rows.length === 0) {
//       return res.status(404).json({ error: "Developer not found" });
//     }

//     res.json(rows[0]);
//   } catch (err) {
//     console.error('Error fetching developer details:', err);
//     res.status(500).json({ error: "Failed to fetch developer details" });
//   }
// });


// NEW: Advanced Search & Filter Endpoint

// =============================================================================
// SEARCH & FILTER ENDPOINT (Specific Category Only & No Limit)
// =============================================================================

// REPO SEARCH (Updated to include repositories_index)
app.get("/api/repos/filter", async (req, res) => {
    try {
        const { q, language, topic, min_stars, sort_by, source } = req.query;
        const searchText = q ? `%${q}%` : null;
        const allowed = ['growings', 'trendings', 'tops', 'repositories_index'];
        const sourceTable = allowed.includes(String(source)) ? String(source) : 'tops';
    
        const queryText = `
          WITH raw_repos AS (
            SELECT *, '${sourceTable}' as source FROM ${sourceTable}
          ),
          unique_repos AS ( SELECT DISTINCT ON (github_id) * FROM raw_repos ORDER BY github_id )
          SELECT 
            ar.*, rs.days_since_last_commit, rs.activity_score, rs.health_score,
            rs.commits_last_year, rs.latest_release_tag, rs.total_releases
          FROM unique_repos ar
          LEFT JOIN repository_stats rs ON ar.github_id = rs.repo_github_id
          WHERE 
            ($1::text IS NULL OR ar.name ILIKE $1 OR ar.description ILIKE $1)
            AND ($2::text IS NULL OR ar.language = $2)
            AND ($3::text IS NULL OR $3 = ANY(ar.topics))
            AND ar.stars_count >= $4
          ORDER BY 
            CASE WHEN $5 = 'newest' THEN ar.created_at END DESC,
            CASE WHEN $5 = 'updated' THEN ar.updated_at END DESC,
            ar.stars_count DESC
        `;
    
        const { rows } = await pool.query(queryText, [searchText, language, topic, min_stars ? parseInt(String(min_stars)) : 0, sort_by]);
        res.json({ data: rows });
    } catch (err) {
        res.status(500).json({ error: "Search failed" });
    }
});


// List: Top Repos (Pagination)
app.get("/api/repos/top", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 30, 300);
    const lastStars = req.query.lastStars ? parseInt(req.query.lastStars as string) : null;
    const lastId = req.query.lastId ? parseInt(req.query.lastId as string) : null;

    // LEFT JOIN on github_id
    let queryText = `
      SELECT 
        r.*,
        rs.health_score, rs.activity_score, rs.days_since_last_commit,
        rs.commits_last_year, rs.latest_release_tag, rs.total_releases
      FROM tops r
      LEFT JOIN repository_stats rs ON r.github_id = rs.repo_github_id
    `;
    
    const params: (number | string)[] = [];

    if (lastStars !== null && lastId !== null) {
      queryText += ` WHERE (r.stars_count, r.id) < ($1, $2)`;
      params.push(lastStars, lastId);
    }
    
    queryText += ` ORDER BY r.stars_count DESC, r.id DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const { rows } = await pool.query(queryText, params);
    
    const hasMore = rows.length === limit;
    const nextCursor = hasMore ? { 
      lastStars: rows[rows.length - 1].stars_count, 
      lastId: rows[rows.length - 1].id 
    } : null;

    res.json({ data: rows, nextCursor, hasMore });
  } catch (err) {
    console.error('Error fetching top repos:', err);
    res.status(500).json({ error: "Failed to fetch repositories" });
  }
});

// List: Growing Repos
app.get('/api/growings-database', async (req, res) => {
  try {
    // LEFT JOIN on github_id
    const queryText = `
      SELECT 
        r.*,
        rs.health_score, rs.activity_score, rs.days_since_last_commit,
        rs.commits_last_year, rs.latest_release_tag, rs.total_releases
      FROM growings r
      LEFT JOIN repository_stats rs ON r.github_id = rs.repo_github_id
      ORDER BY r.stars_count DESC, r.id DESC
    `;
    
    const { rows } = await pool.query(queryText);
    res.json({ data: rows });
  } catch (err) {
    console.error('Error fetching growing repos:', err);
    res.status(500).json({ error: "Failed to fetch repositories" });
  }
});

// List: Trending Repos (New)
app.get('/api/trendings-database', async (req, res) => {
  try {
    // LEFT JOIN on github_id
    const queryText = `
      SELECT 
        r.*,
        rs.health_score, rs.activity_score, rs.days_since_last_commit,
        rs.commits_last_year, rs.latest_release_tag, rs.total_releases
      FROM trendings r
      LEFT JOIN repository_stats rs ON r.github_id = rs.repo_github_id
      ORDER BY r.stars_count DESC, r.id DESC
    `;
    
    const { rows } = await pool.query(queryText);
    res.json({ data: rows });
  } catch (err) {
    console.error('Error fetching trending repos:', err);
    res.status(500).json({ error: "Failed to fetch repositories" });
  }
});

// Replace the /api/repos/search endpoint in index.ts with this fixed version

app.get("/api/repos/search", async (req, res) => {
  try {
    const fullName = req.query.full_name as string;
    
    if (!fullName) {
      return res.status(400).json({ error: "full_name parameter is required" });
    }

    // Define the exact columns we want to retrieve (common to all tables)
    const columns = `
      r.id, r.github_id, r.full_name, r.name, r.owner_login, r.owner_avatar_url,
      r.description, r.html_url, r.homepage_url, r.stars_count, r.forks_count,
      r.watchers_count, r.open_issues_count, r.size_kb, r.language, r.topics,
      r.license_name, r.created_at, r.updated_at, r.pushed_at, r.is_fork,
      r.is_archived, r.is_disabled, r.allow_forking, r.is_template, r.visibility,
      r.has_issues, r.has_projects, r.has_downloads, r.has_wiki, r.has_pages,
      r.has_discussions, r.default_branch, r.subscribers_count, r.network_count,
      r.last_fetched
    `;

    // Consolidated Search across ALL tables with explicit column selection
    const query = `
      (
        SELECT ${columns}, rs.health_score, rs.activity_score, 'tops' as source_table
        FROM tops r
        LEFT JOIN repository_stats rs ON r.github_id = rs.repo_github_id
        WHERE r.full_name = $1
      )
      UNION ALL
      (
        SELECT ${columns}, rs.health_score, rs.activity_score, 'growings' as source_table
        FROM growings r
        LEFT JOIN repository_stats rs ON r.github_id = rs.repo_github_id
        WHERE r.full_name = $1
      )
      UNION ALL
      (
        SELECT ${columns}, rs.health_score, rs.activity_score, 'trendings' as source_table
        FROM trendings r
        LEFT JOIN repository_stats rs ON r.github_id = rs.repo_github_id
        WHERE r.full_name = $1
      )
      UNION ALL
      (
        SELECT ${columns}, rs.health_score, rs.activity_score, 'repositories_index' as source_table
        FROM repositories_index r
        LEFT JOIN repository_stats rs ON r.github_id = rs.repo_github_id
        WHERE r.full_name = $1
      )
      LIMIT 1
    `;
    
    const { rows } = await pool.query(query, [fullName]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Repository not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Error searching repository:', err);
    res.status(500).json({ error: "Failed to search repository" });
  }
});

// Details: Single Repo Details
// REPO DETAILS (Looks in all tables)
app.get("/api/repos/:id/details", async (req, res) => {
  try {
    const repoId = parseInt(req.params.id);
    const sourceParam = req.query.source as string || 'tops'; 
    const allowedTables = ['tops', 'growings', 'trendings', 'repositories_index'];
    const tableName = allowedTables.includes(sourceParam) ? sourceParam : 'tops';
    
    const repoQuery = `
      SELECT 
        r.*,
        rs.commits_last_month, rs.commits_last_year,
        rs.issues_closed_last_month, rs.pull_requests_merged_last_month,
        rs.stars_growth_30d, rs.forks_growth_30d, rs.contributors_count,
        rs.activity_score, rs.health_score,
        rs.avg_issue_close_time_days, rs.avg_pr_merge_time_days,
        rs.days_since_last_commit, rs.latest_release_tag, rs.total_releases
      FROM ${tableName} r
      LEFT JOIN repository_stats rs ON r.github_id = rs.repo_github_id
      WHERE r.id = $1
    `;
    
    const repoResult = await pool.query(repoQuery, [repoId]);
    if (repoResult.rows.length === 0) return res.status(404).json({ error: "Repository not found" });
    
    const repository = repoResult.rows[0];
    const githubId = repository.github_id;
    
    const languagesResult = await pool.query(`
      SELECT language_name, bytes_count, percentage
      FROM repository_languages
      WHERE repo_github_id = $1
      ORDER BY percentage DESC
    `, [githubId]);
    
    res.json({
      ...repository,
      languages: languagesResult.rows,
      source_table: tableName, 
    });
    
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch repository details" });
  }
});

// Sub-resource: Contributors
app.get("/api/repos/:id/contributors", async (req, res) => {
  try {
    const localId = parseInt(req.params.id);
    const source = req.query.source as string || 'tops';
    
    // 1. Resolve GitHub ID
    const githubId = await getGithubIdFromLocal(source, localId);
    if (!githubId) return res.status(404).json({ error: "Repository not found" });

    // 2. Query shared metrics
    const { rows } = await pool.query(
      `SELECT login, avatar_url, html_url, contributions, data_source
       FROM repository_contributors
       WHERE repo_github_id = $1
       ORDER BY contributions DESC
       LIMIT 30`,
      [githubId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching contributors:', error);
    res.status(500).json({ error: 'Failed to fetch contributors' });
  }
});

// Sub-resource: Commit Activity
app.get("/api/repos/:id/commit-activity", async (req, res) => {
  try {
    const localId = parseInt(req.params.id);
    const source = req.query.source as string || 'tops';

    // 1. Resolve GitHub ID
    const githubId = await getGithubIdFromLocal(source, localId);
    if (!githubId) return res.status(404).json({ error: "Repository not found" });

    // 2. Query shared metrics
    const { rows } = await pool.query(
      `SELECT week_date, total_commits
       FROM repository_commit_activity
       WHERE repo_github_id = $1
       ORDER BY week_date ASC`,
      [githubId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching commit activity:', error);
    res.status(500).json({ error: 'Failed to fetch commit activity' });
  }
});

// Sub-resource: Recent Commits
app.get("/api/repos/:id/commits", async (req, res) => {
  try {
    const localId = parseInt(req.params.id);
    const source = req.query.source as string || 'tops';
    const limit = Math.min(parseInt(req.query.limit as string) || 15, 50);
    
    // 1. Resolve GitHub ID
    const githubId = await getGithubIdFromLocal(source, localId);
    if (!githubId) return res.status(404).json({ error: "Repository not found" });

    // 2. Query shared metrics
    const { rows } = await pool.query(
      `SELECT 
        sha,
        commit_message,
        author_name,
        author_email,
        author_login,
        author_avatar_url,
        committer_name,
        committer_date,
        additions,
        deletions,
        total_changes,
        files_changed,
        html_url,
        fetched_at
       FROM repository_commits
       WHERE repo_github_id = $1
       ORDER BY committer_date DESC
       LIMIT $2`,
      [githubId, limit]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching commits:', error);
    res.status(500).json({ error: 'Failed to fetch commits' });
  }
});

// Stats: Global
app.get('/api/stats', async (req, res) => {
  try {
    // Example: aggregating stats from the 'tops' table
    const { rows } = await pool.query(`
      SELECT 
        COUNT(*) as total_repos,
        SUM(stars_count) as total_stars
      FROM tops
    `);
    
    res.json({
      totalRepositories: parseInt(rows[0].total_repos, 10) || 0,
      totalStars: parseInt(rows[0].total_stars, 10) || 0
    });
  } catch (err) {
    console.error('Failed to fetch stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/api/health', async (req, res) => {
  res.json({ status: "OK", message: "Server is healthy" });
});

// =============================================================================
// 4. STATIC FILES & FALLBACK
// =============================================================================

app.use(express.static(path.join(__dirname, "../../public")));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, "../../public/index.html"));
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`\n🌐 Server running on http://localhost:${port}`);

  if (process.env.SYNC_DATA_ON_STARTUP === 'true') {
    console.log("\nSYNC_DATA_ON_STARTUP is true. Checking if database is empty...");
    (async () => {
      try {
        const { rows } = await pool.query('SELECT COUNT(*) as count FROM tops');
        if (parseInt(rows[0].count, 10) === 0) {
          console.log("Database is empty, starting initial quick sync...");
          await githubService.syncQuick();
        } else {
          console.log("Database already contains data. Skipping startup sync.");
        }
      } catch (error) {
        console.error("❌ Error during startup sync check:", error);
      }
    })();
  }
});
