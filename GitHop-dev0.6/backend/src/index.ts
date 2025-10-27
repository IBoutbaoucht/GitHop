import express from "express";
import pool from "./db.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import githubService from "./services/githubService.js";
import { log } from "console";
import workerService from './services/workerService.js';
import scheduler from './services/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health',async (req , res) => {
    console.log("lol lol")
    res.json({"111111HealthObbfbfbffbOOO":"imad niibbbbb gdfjgdfgdkjfgdjkdgdj  ggggggggggggggggggggggggggggbbbbbi"}) ;
})


// Trigger background job manually (for testing)
app.post("/api/workers/update-contributors", async (req, res) => {
  try {
    await workerService.updateContributors();
    res.status(202).json({ message: "Contributors update started" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/workers/update-commit-activity", async (req, res) => {
  try {
    await workerService.updateCommitActivity();
    res.status(202).json({ message: "Commit activity update started" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/workers/run-all", async (req, res) => {
  try {
    workerService.runAllJobs();
    res.status(202).json({ message: "All background jobs started" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get contributors from database
app.get("/api/repos/:id/contributors", async (req, res) => {
  try {
    const repoId = parseInt(req.params.id);
    const { rows } = await pool.query(
      `SELECT login, avatar_url, html_url, contributions
       FROM repository_contributors
       WHERE repository_id = $1
       ORDER BY contributions DESC
       LIMIT 30`,
      [repoId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching contributors:', error);
    res.status(500).json({ error: 'Failed to fetch contributors' });
  }
});

// Get commit activity from database
app.get("/api/repos/:id/commit-activity", async (req, res) => {
  try {
    const repoId = parseInt(req.params.id);
    const { rows } = await pool.query(
      `SELECT week_date, total_commits
       FROM repository_commit_activity
       WHERE repository_id = $1
       ORDER BY week_date ASC`,
      [repoId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching commit activity:', error);
    res.status(500).json({ error: 'Failed to fetch commit activity' });
  }
});

// API routes (must come before static files and catch-all)
app.get("/api/repos/top", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 30, 300);
    const lastStars = req.query.lastStars ? parseInt(req.query.lastStars as string) : null;
    const lastId = req.query.lastId ? parseInt(req.query.lastId as string) : null;

    let queryText = `
      SELECT 
        r.id, r.github_id, r.name, r.full_name, r.owner_login, r.owner_avatar_url,
        r.description, r.html_url, r.homepage_url,
        r.stars_count, r.forks_count, r.watchers_count, r.open_issues_count,
        r.language, r.topics, r.license_name,
        r.created_at, r.pushed_at, r.is_archived, r.is_fork,
        r.has_issues, r.has_wiki, r.has_pages, r.has_discussions,
        rs.health_score, rs.activity_score, rs.days_since_last_commit,
        rs.commits_last_year, rs.latest_release_tag, rs.total_releases,
        rs.contributors_data_type -- *** ADDED THIS COLUMN ***
      FROM repositories r
      LEFT JOIN repository_stats rs ON r.id = rs.repository_id
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

app.get("/api/repos/:id/details", async (req, res) => {
  try {
    const repoId = parseInt(req.params.id);
    
    const repoQuery = `
      SELECT 
        r.*,
        rs.commits_last_month, rs.commits_last_year,
        rs.issues_closed_last_month, rs.pull_requests_merged_last_month,
        rs.stars_growth_30d, rs.forks_growth_30d, rs.contributors_count,
        rs.activity_score, rs.health_score,
        rs.avg_issue_close_time_days, rs.avg_pr_merge_time_days,
        rs.days_since_last_commit, rs.days_since_last_release,
        rs.latest_release_tag, rs.latest_release_date, rs.total_releases,
        rs.contributors_data_type -- *** ADDED THIS COLUMN ***
      FROM repositories r
      LEFT JOIN repository_stats rs ON r.id = rs.repository_id
      WHERE r.id = $1
    `;
    
    const repoResult = await pool.query(repoQuery, [repoId]);
    
    if (repoResult.rows.length === 0) {
      return res.status(404).json({ error: "Repository not found" });
    }
    
    const repository = repoResult.rows[0];
    
    const languagesQuery = `
      SELECT language_name, bytes_count, percentage
      FROM repository_languages
      WHERE repository_id = $1
      ORDER BY percentage DESC
    `;
    
    const languagesResult = await pool.query(languagesQuery, [repoId]);
    
    res.json({
      ...repository,
      languages: languagesResult.rows
    });
    
  } catch (err) {
    console.error('Error fetching repo details:', err);
    res.status(500).json({ error: "Failed to fetch repository details" });
  }
});

// "/api/repos/search?full_name=oussama"
// Search repository by full_name
// Add this after the /api/stats route
app.get("/api/repos/search", async (req, res) => {
  try {
    const fullName = req.query.full_name as string;
    
    if (!fullName) {
      return res.status(400).json({ error: "full_name parameter is required" });
    }

    const query = `
      SELECT 
        r.id, r.github_id, r.name, r.full_name, r.owner_login, r.owner_avatar_url,
        r.description, r.html_url, r.homepage_url,
        r.stars_count, r.forks_count, r.watchers_count, r.open_issues_count,
        r.language, r.topics, r.license_name,
        r.created_at, r.pushed_at, r.is_archived, r.is_fork,
        r.has_issues, r.has_wiki, r.has_pages, r.has_discussions,
        rs.health_score, rs.activity_score, rs.days_since_last_commit,
        rs.commits_last_year, rs.latest_release_tag, rs.total_releases,
        rs.contributors_data_type -- *** ADDED THIS COLUMN ***
      FROM repositories r
      LEFT JOIN repository_stats rs ON r.id = rs.repository_id
      WHERE r.full_name = $1
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


app.get('/api/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        COUNT(*) as total_repos,
        SUM(stars_count) as total_stars
      FROM repositories
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

app.post("/api/sync/quick", async (req, res) => {
  try {
    githubService.syncQuick();
    res.status(202).json({ message: "Quick sync started successfully." });
  } catch (error: any) {
    console.error("❌ Quick sync trigger error:", error);
    res.status(500).json({ error: "Failed to start quick sync", details: error.message });
  }
  // try{
  //   workerService.runAllJobs();
  //   res.status(202).json({ message: "Contributors and Commit Activity Fetching started successfully. ( Quick Sync )" });
  // }catch{

  // }
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

// Serve static files from the React app
app.use(express.static(path.join(__dirname, "../public")));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`\n🌐 Server running on http://localhost:${port}`);

  // scheduler.start();
  
  if (process.env.SYNC_DATA_ON_STARTUP === 'true') {
    console.log("\nSYNC_DATA_ON_STARTUP is true. Checking if database is empty...");
    (async () => {
      try {
        const { rows } = await pool.query('SELECT COUNT(*) as count FROM repositories');
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
