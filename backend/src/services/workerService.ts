import pool from '../db.js';
import { GraphQLClient, gql } from 'graphql-request';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

class WorkerService {
  private graphqlClient: GraphQLClient;

  constructor() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN is not set.');
    this.graphqlClient = new GraphQLClient(GITHUB_GRAPHQL_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // ===========================================================================
  // 1. STUB HYDRATION (The Full Fetch)
  //    Upgrades a 'stub' repo (basic info) to 'complete' (full metadata)
  // ===========================================================================

  public async hydrateStubs(): Promise<void> {
    console.log('🔄 Hydrating Stub Repositories...');

    // Fetch stubs from the single master table
    const { rows } = await pool.query(`
        SELECT id, github_id, full_name
        FROM repositories
        WHERE sync_status = 'stub'
    `);

    if (rows.length === 0) {
        console.log("   No stubs to hydrate.");
        return;
    }

    console.log(`   Found ${rows.length} stubs to hydrate.`);

    for (const row of rows) {
        try {
            console.log(`   💧 Hydrating ${row.full_name}...`);
            await this.fetchAndEnrichRepo(row.github_id, row.full_name);
            // Rate limit protection: Pause between heavy GraphQL writes
            await this.sleep(1000);
        } catch (e: any) {
            console.error(`   ❌ Failed to hydrate ${row.full_name}:`, e.message);
        }
    }
  }

  /**
   * Fetches FULL details via GraphQL and updates the main table + auxiliary tables
   */
/**
   * Fetches FULL details via GraphQL and updates the main table + auxiliary tables
   */
  private async fetchAndEnrichRepo(githubId: string, fullName: string): Promise<void> {
      const [owner, name] = fullName.split('/');

      const query = gql`
        query RepoHydrate($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) {
            databaseId, name, nameWithOwner, owner { login, avatarUrl }, description, url, homepageUrl,
            stargazerCount, forkCount, watchers { totalCount }, issues(states: OPEN) { totalCount },
            diskUsage, primaryLanguage { name },
            repositoryTopics(first: 10) { nodes { topic { name } } },
            languages(first: 10, orderBy: {field: SIZE, direction: DESC}) { edges { size, node { name } }, totalSize },
            licenseInfo { name },
            createdAt, updatedAt, pushedAt,
            isFork, isArchived, isDisabled, forkingAllowed, isTemplate, visibility,
            hasIssuesEnabled, hasProjectsEnabled, hasWikiEnabled, hasDiscussionsEnabled,
            defaultBranchRef { name, target { ... on Commit { history(first: 1) { totalCount } } } },
            releases(first: 1, orderBy: {field: CREATED_AT, direction: DESC}) { totalCount, nodes { tagName, publishedAt } },

            # --- NEW: Fetch README Content ---
            readme: object(expression: "HEAD:README.md") {
              ... on Blob {
                text
              }
            }
          }
        }
      `;

      let data: any;
      try {
        data = await this.graphqlClient.request(query, { owner, name });
      } catch (e) {
        console.error(`Error fetching GraphQL for ${fullName}`);
        return;
      }

      const repo = data.repository;
      if (!repo) return;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // 1. Prepare Data
        const topics = repo.repositoryTopics?.nodes?.map((t:any) => t.topic.name) || [];

        // --- NEW: Process README ---
        // We take the text, or empty string if null.
        // We truncate to 10,000 chars to save DB space but keep enough for search/display.
        const rawReadme = repo.readme?.text || "";
        const readmeSnippet = rawReadme.slice(0, 10000);

        // 2. Update the Master Table with FULL details (Added readme_snippet)
        await client.query(
          `UPDATE repositories SET
             name = $2, full_name = $3, owner_login = $4, owner_avatar_url = $5, description = $6,
             html_url = $7, homepage_url = $8, stars_count = $9, forks_count = $10, watchers_count = $11,
             open_issues_count = $12, size_kb = $13, language = $14, topics = $15, license_name = $16,
             created_at = $17, updated_at = $18, pushed_at = $19,
             is_fork = $20, is_archived = $21, is_disabled = $22, allow_forking = $23, is_template = $24,
             visibility = $25, has_issues = $26, has_projects = $27, has_downloads = $28, has_wiki = $29,
             has_pages = $30, has_discussions = $31, default_branch = $32,
             readme_snippet = $33,  -- <--- NEW COLUMN
             last_fetched = NOW(), sync_status = 'complete'
           WHERE github_id = $1`,
          [
            githubId, repo.name, repo.nameWithOwner, repo.owner.login, repo.owner.avatarUrl, repo.description,
            repo.url, repo.homepageUrl, repo.stargazerCount, repo.forkCount, repo.watchers.totalCount,
            repo.issues.totalCount, repo.diskUsage, repo.primaryLanguage?.name, topics, repo.licenseInfo?.name,
            repo.createdAt, repo.updatedAt, repo.pushedAt,
            repo.isFork, repo.isArchived, repo.isDisabled, repo.forkingAllowed, repo.isTemplate,
            repo.visibility, repo.hasIssuesEnabled, repo.hasProjectsEnabled, true, repo.hasWikiEnabled,
            false, repo.hasDiscussionsEnabled, repo.defaultBranchRef?.name,
            readmeSnippet // <--- NEW PARAMETER ($33)
          ]
        );

        // 3. Save Languages (Linked Table)
        if (repo.languages?.edges) {
            await client.query('DELETE FROM repository_languages WHERE repo_github_id = $1', [githubId]);
            for (const lang of repo.languages.edges) {
                const percentage = repo.languages.totalSize > 0 ? (lang.size / repo.languages.totalSize) * 100 : 0;
                await client.query(
                    `INSERT INTO repository_languages (repo_github_id, language_name, bytes_count, percentage)
                     VALUES ($1, $2, $3, $4)`,
                    [githubId, lang.node.name, lang.size, percentage]
                );
            }
        }

        // 4. Save Stats (Linked Table)
        const commits = repo.defaultBranchRef?.target?.history?.totalCount || 0;
        const releases = repo.releases?.totalCount || 0;
        const latestRelease = repo.releases?.nodes?.[0];
        const activityScore = Math.log10(commits + 1) * 20 + (releases * 5);

        await client.query(
            `INSERT INTO repository_stats (
                repo_github_id, commits_last_year, total_releases,
                latest_release_tag, latest_release_date, activity_score, calculated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (repo_github_id) DO UPDATE SET
                commits_last_year = EXCLUDED.commits_last_year,
                activity_score = EXCLUDED.activity_score,
                calculated_at = NOW()`,
            [githubId, commits, releases, latestRelease?.tagName, latestRelease?.publishedAt, activityScore]
        );

        await client.query('COMMIT');
        console.log(`   ✓ Hydrated: ${fullName}`); // Optional log
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
  }

  // ===========================================================================
  // 2. CONTRIBUTORS WORKER (Robust Hybrid Strategy)
  //    Try REST -> If fail/limit -> Try GraphQL History -> Enrich with Search
  // ===========================================================================

  // MODE A: UPDATE ALL (Refresh everything, or specific ID)
  public async updateAllContributors(repositoryId?: number): Promise<void> {
    console.log(`🔄 [Contributors] Updating ALL (Refresh Mode)...`);
    const query = repositoryId
      ? `SELECT id, github_id, full_name FROM repositories WHERE id = $1`
      : `SELECT id, github_id, full_name FROM repositories WHERE sync_status = 'complete' ORDER BY stars_count DESC LIMIT 50`;
    await this.processContributorsBatch(query, repositoryId ? [repositoryId] : []);
  }

  // MODE B: UPDATE MISSING (Only fetch if not yet fetched)
  public async updateMissingContributors(): Promise<void> {
    console.log(`🔄 [Contributors] Updating MISSING only...`);
    const query = `
      SELECT r.id, r.github_id, r.full_name
      FROM repositories r
      LEFT JOIN repository_stats rs ON r.github_id = rs.repo_github_id
      WHERE r.sync_status = 'complete'
      AND (rs.contributors_fetched IS FALSE OR rs.contributors_fetched IS NULL)
      ORDER BY r.stars_count DESC
      LIMIT 50
    `;
    await this.processContributorsBatch(query, []);
  }

  private async processContributorsBatch(query: string, params: any[]): Promise<void> {
    const client = await pool.connect();
    try {
      const { rows } = await pool.query(query, params);
      if (rows.length === 0) {
          console.log("   No contributors to update.");
          return;
      }
      for (const repo of rows) {
          try {
            await this.fetchAndSaveContributors(repo.github_id, repo.full_name);
            console.log(`  ✓ Contributors updated for ${repo.full_name}`);
            await this.sleep(1500); // Respect rate limits (REST + potential GraphQL)
          } catch (error: any) {
            console.error(`  ❌ Error contributors for ${repo.full_name}:`, error.message);
          }
      }
    } finally {
      client.release();
    }
  }

  /**
   * HYBRID: Fetch and save contributors.
   * Strategy:
   * 1. Attempt standard REST API.
   * 2. If REST returns 403 (limit) or 204 (empty/too large), trigger GraphQL Fallback.
   */
  private async fetchAndSaveContributors(repoGithubId: string, fullName: string): Promise<void> {
    // --- METHOD 1: Try REST API (All-time top 30) ---
    let response: Response;
    try {
      response = await fetch(
        `https://api.github.com/repos/${fullName}/contributors?per_page=30`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );
    } catch (fetchError: any) {
      throw new Error(`Network error fetching contributors: ${fetchError.message}`);
    }

    if (response.ok) {
      // Success! We got the easy list.
      const contributors = await response.json();
      await this.saveContributorsToDB(repoGithubId, contributors, null, 'all_time');
      return;
    }

    // --- FAILURE (REST API) ---
    // Check for specific "list too large" error or empty 204 requiring GraphQL fallback
    if (response.status === 403 || response.status === 204) {
      try {
        const errorData = await response.json().catch(() => ({}));
        // GitHub API explicitly tells us if the list is too big to generate via REST
        if (errorData.message?.includes("list is too large") || response.status === 204) {
             console.warn(`  [Info] ${fullName} list too large/empty. REST failed. Falling back to GraphQL.`);
             await this.fetchAndSaveRecentContributorsGraphQL(repoGithubId, fullName);
             return;
        }
      } catch (e) { /* ignore JSON parse error */ }
    }

    // Fallback: If REST fails for any other reason (timeout, etc), try GraphQL anyway as a Hail Mary
    console.warn(`  [Info] REST failed (${response.status}). Trying GraphQL fallback for ${fullName}...`);
    await this.fetchAndSaveRecentContributorsGraphQL(repoGithubId, fullName);
  }

  /**
   * METHOD 2 (FALLBACK):
   * 1. Scans recent commit history via GraphQL to find active users.
   * 2. ENRICHES those users with true "all-time" commit counts using the Search API.
   */
  private async fetchAndSaveRecentContributorsGraphQL(repoGithubId: string, fullName: string): Promise<void> {
    const [owner, name] = fullName.split('/');

    // Query: Iterate through commit history
    const query = gql`
      query GetRecentContributors($owner: String!, $name: String!, $cursor: String) {
        repository(owner: $owner, name: $name) {
          defaultBranchRef {
            target {
              ... on Commit {
                history(first: 100, after: $cursor) {
                  pageInfo { endCursor, hasNextPage }
                  nodes {
                    author { user { databaseId, login, avatarUrl, htmlUrl: url } }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const contributorsMap = new Map<string, {
      id: number;
      login: string;
      avatar_url: string;
      html_url: string;
      contributions: number;
    }>();

    let cursor: string | null = null;
    let hasNextPage = true;
    const maxPages = 5; // Scan last 500 commits max

    for (let i = 0; i < maxPages && hasNextPage; i++) {
      try {
        const data: any = await this.graphqlClient.request(query, { owner, name, cursor });
        const history = data.repository?.defaultBranchRef?.target?.history;
        if (!history) break;

        for (const node of history.nodes) {
          const user = node.author?.user;
          // Only count actual GitHub users, not generic git emails
          if (user && user.databaseId) {
            const existing = contributorsMap.get(user.login);
            if (existing) {
              existing.contributions += 1;
            } else {
              contributorsMap.set(user.login, {
                id: user.databaseId,
                login: user.login,
                avatar_url: user.avatarUrl,
                html_url: user.htmlUrl,
                contributions: 1,
              });
            }
          }
        }
        cursor = history.pageInfo.endCursor;
        hasNextPage = history.pageInfo.hasNextPage;
      } catch (error: any) {
         if (error.message?.includes('404') || error.message?.includes('MISSING')) return;
         console.error(`  [GraphQL Error] Page ${i}: ${error.message}`);
      }
    }

    if (contributorsMap.size === 0) return;

    // 1. Get the list of most active recent contributors (up to 30)
    let sortedContributors = Array.from(contributorsMap.values())
      .sort((a, b) => b.contributions - a.contributions)
      .slice(0, 30);

    // 2. Enrich ALL of them with true all-time counts using Search API
    // We process sequentially to respect the 30 req/min search limit strictly
    const enrichedContributors = [];
    for (const contributor of sortedContributors) {
      try {
        await this.sleep(2000); // Hard wait for Search API rate limits (essential!)
        const totalCount = await this.fetchUserTotalCommits(fullName, contributor.login);
        if (totalCount > contributor.contributions) {
            contributor.contributions = totalCount;
        }
      } catch (e) {
          // If search fails, we just keep the recent count as a fallback
      }
      enrichedContributors.push(contributor);
    }

    // 3. Save to DB with data_source='recent' (to indicate it might be an approximation)
    await this.saveContributorsToDB(repoGithubId, enrichedContributors, 'User', 'recent');
  }

  /**
   * Helper: Uses Search API to get total commits for a user in a repo
   */
  private async fetchUserTotalCommits(fullName: string, login: string): Promise<number> {
    try {
      const res = await fetch(
        `https://api.github.com/search/commits?q=repo:${fullName}+author:${login}&per_page=1`,
        { headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } }
      );
      if (res.ok) {
        const data = await res.json();
        return data.total_count || 0;
      }
      return 0;
    } catch (error) { return 0; }
  }

  // Updated Save Method: Sets the 'contributors_fetched' flag to TRUE
  private async saveContributorsToDB(repoGithubId: string, contributors: any[], fallbackType: string | null, dataType: 'all_time' | 'recent'): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // UPDATE FLAG: Mark as fetched
      await client.query(`
        UPDATE repository_stats
        SET contributors_data_type = $1, contributors_fetched = TRUE
        WHERE repo_github_id = $2
      `, [dataType, repoGithubId]);

      await client.query('DELETE FROM repository_contributors WHERE repo_github_id = $1', [repoGithubId]);

      for (const contributor of contributors) {
        if (!contributor || !contributor.login) continue;
        const contributorGithubId = contributor.id || contributor.databaseId;
        if (!contributorGithubId) continue;

        await client.query(
          `INSERT INTO repository_contributors
           (repo_github_id, contributor_github_id, login, avatar_url, html_url, contributions, type, data_source, fetched_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           ON CONFLICT (repo_github_id, contributor_github_id) DO UPDATE SET
             contributions = EXCLUDED.contributions,
             fetched_at = NOW(),
             data_source = EXCLUDED.data_source`,
          [
            repoGithubId, contributorGithubId, contributor.login,
            contributor.avatar_url || contributor.avatarUrl,
            contributor.html_url || contributor.htmlUrl,
            contributor.contributions,
            contributor.type || fallbackType,
            dataType
          ]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ===========================================================================
  // 3. COMMIT ACTIVITY WORKER (With Retry Logic)
  //    Handles 202 Accepted (Computing) status from GitHub
  // ===========================================================================

  // MODE A: UPDATE ALL
  public async updateAllCommitActivity(repositoryId?: number): Promise<void> {
    console.log(`🔄 [Activity] Updating ALL (Refresh Mode)...`);
    const query = repositoryId
      ? `SELECT id, github_id, full_name FROM repositories WHERE id = $1`
      : `SELECT id, github_id, full_name FROM repositories WHERE sync_status = 'complete' LIMIT 100`;
    await this.processActivityBatch(query, repositoryId ? [repositoryId] : []);
  }

  // MODE B: UPDATE MISSING
  public async updateMissingCommitActivity(): Promise<void> {
    console.log(`🔄 [Activity] Updating MISSING only...`);
    const query = `
      SELECT r.id, r.github_id, r.full_name
      FROM repositories r
      LEFT JOIN repository_stats rs ON r.github_id = rs.repo_github_id
      WHERE r.sync_status = 'complete'
      AND (rs.commit_activity_fetched IS FALSE OR rs.commit_activity_fetched IS NULL)
      LIMIT 100
    `;
    await this.processActivityBatch(query, []);
  }

  private async processActivityBatch(query: string, params: any[]): Promise<void> {
    const client = await pool.connect();
    try {
      const { rows } = await pool.query(query, params);
      if (rows.length === 0) {
          console.log("   No activity to update.");
          return;
      }
      for (const repo of rows) {
        try {
          await this.fetchAndSaveCommitActivity(repo.github_id, repo.full_name);
          await this.sleep(2000); // 2s gap
        } catch (error) {
          console.error(`  ❌ Error updating commit activity for ${repo.full_name}:`, error);
        }
      }
    } finally {
      client.release();
    }
  }

  private async fetchAndSaveCommitActivity(repoGithubId: string, fullName: string): Promise<void> {
    const maxRetries = 3;
    let attempt = 0;
    let response: Response | null = null;

    // Retry Loop for 202 Status
    while (attempt < maxRetries) {
      try {
        response = await fetch(
          `https://api.github.com/repos/${fullName}/stats/commit_activity`,
          { headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } }
        );

        if (response.ok) break;

        // If GitHub says "Computing...", wait and retry
        if (response.status === 202) {
          console.log(`  ⏳ GitHub computing stats for ${fullName}. Retrying in 2s...`);
          await this.sleep(2000);
          attempt++;
          continue;
        }
        throw new Error(`Failed to fetch activity: ${response.status}`);
      } catch (error) { throw error; }
    }

    if (!response || !response.ok) return;

    const activityData = await response.json();
    if (!Array.isArray(activityData) || activityData.length === 0) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // UPDATE FLAG: Mark as fetched
      await client.query(`UPDATE repository_stats SET commit_activity_fetched = TRUE WHERE repo_github_id = $1`, [repoGithubId]);

      await client.query('DELETE FROM repository_commit_activity WHERE repo_github_id = $1', [repoGithubId]);

      for (const week of activityData) {
        const weekDate = new Date(week.week * 1000);
        await client.query(
          `INSERT INTO repository_commit_activity (repo_github_id, week_timestamp, week_date, total_commits)
           VALUES ($1, $2, $3, $4)`,
          [repoGithubId, week.week, weekDate, week.total]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ===========================================================================
  // 4. RECENT COMMITS WORKER (With Detailed Stats)
  //    Fetches actual commit messages, authors, and stats
  // ===========================================================================

  // MODE A: UPDATE ALL
  public async updateAllRecentCommits(repositoryId?: number): Promise<void> {
    console.log(`🔄 [Commits] Updating ALL (Refresh Mode)...`);
    const query = repositoryId
      ? `SELECT id, github_id, full_name FROM repositories WHERE id = $1`
      : `SELECT id, github_id, full_name FROM repositories WHERE sync_status = 'complete' LIMIT 100`;
    await this.processCommitsBatch(query, repositoryId ? [repositoryId] : []);
  }

  // MODE B: UPDATE MISSING
  public async updateMissingRecentCommits(): Promise<void> {
    console.log(`🔄 [Commits] Updating MISSING only...`);
    const query = `
      SELECT r.id, r.github_id, r.full_name
      FROM repositories r
      LEFT JOIN repository_stats rs ON r.github_id = rs.repo_github_id
      WHERE r.sync_status = 'complete'
      AND (rs.recent_commits_fetched IS FALSE OR rs.recent_commits_fetched IS NULL)
      LIMIT 100
    `;
    await this.processCommitsBatch(query, []);
  }

  private async processCommitsBatch(query: string, params: any[]): Promise<void> {
    const client = await pool.connect();
    try {
        const { rows } = await pool.query(query, params);
        if (rows.length === 0) {
            console.log("   No commits to update.");
            return;
        }
        for (const repo of rows) {
            try {
                await this.fetchAndSaveRecentCommits(repo.github_id, repo.full_name);
                await this.sleep(1000);
            } catch (error: any) {
                console.error(`  ❌ Error commits for ${repo.full_name}:`, error.message);
            }
        }
    } finally {
        client.release();
    }
  }

  private async fetchAndSaveRecentCommits(repoGithubId: string, fullName: string): Promise<void> {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${fullName}/commits?per_page=50`,
        { headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } }
      );

      if (!response.ok) return;

      const commits = await response.json();
      if (!Array.isArray(commits) || commits.length === 0) return;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // UPDATE FLAG: Mark as fetched
        await client.query(`UPDATE repository_stats SET recent_commits_fetched = TRUE WHERE repo_github_id = $1`, [repoGithubId]);

        await client.query('DELETE FROM repository_commits WHERE repo_github_id = $1', [repoGithubId]);

        for (const commit of commits) {
          if (!commit.sha || !commit.commit) continue;

          const author = commit.author || {};
          const commitData = commit.commit;
          // Note: 'stats' (additions/deletions) are typically not in the list view response of GitHub API.
          // Getting them requires fetching EACH commit individually, which is too expensive.
          // We default to 0 here unless we implement a deep-fetch strategy (which is usually overkill).
          const stats = commit.stats || { additions: 0, deletions: 0, total: 0 };
          const filesChanged = commit.files ? commit.files.length : 0;

          await client.query(
            `INSERT INTO repository_commits
             (repo_github_id, sha, commit_message, author_name, author_email,
              author_login, author_avatar_url, committer_name, committer_date,
              additions, deletions, total_changes, files_changed, html_url, fetched_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
             ON CONFLICT (repo_github_id, sha) DO UPDATE SET
               commit_message = EXCLUDED.commit_message,
               fetched_at = NOW()`,
            [
              repoGithubId,
              commit.sha,
              commitData.message || 'No message',
              commitData.author?.name || 'Unknown',
              commitData.author?.email || '',
              author.login || null,
              author.avatar_url || null,
              commitData.committer?.name || 'Unknown',
              commitData.committer?.date || new Date().toISOString(),
              stats.additions || 0,
              stats.deletions || 0,
              stats.total || 0,
              filesChanged,
              commit.html_url || `https://github.com/${commit.sha}`
            ]
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) { throw error; }
  }

  // ===========================================================================
  // 5. JOB ORCHESTRATION
  //    The main entry point for the background worker process
  // ===========================================================================

  // Main runner: Updates MISSING data by default to be efficient
  public async runAllJobs(forceUpdateAll = false): Promise<void> {
    console.log(`🚀 Starting ALL background jobs (Force Update: ${forceUpdateAll})...`);
    // 1. Hydrate Stubs first so subsequent jobs have data to work on
    await this.hydrateStubs();

    // 2. Refresh metrics based on mode
    if (forceUpdateAll) {
        await this.updateAllRecentCommits();
        await this.updateAllCommitActivity();
        await this.updateAllContributors();
    } else {
        // Efficient Mode: Only fetch what we don't have
        await this.updateMissingRecentCommits();
        await this.updateMissingCommitActivity();
        await this.updateMissingContributors();
    }

    console.log('\n✅ All background jobs completed successfully!');

  }

  public async runReposOneByOne(): Promise<void> {
    console.log(`🚀 Starting runReposOneByOne ...`);

    const query = `SELECT id, github_id, full_name FROM repositories ORDER BY stars_count DESC`;
    const client = await pool.connect();
    try {
        const { rows } = await pool.query(query);
        if (rows.length === 0) {
            console.log(" No Repos in the database.");
            return;
        }
        for (const repo of rows) {
            // try {
            //     await this.fetchAndSaveRecentCommits(repo.github_id, repo.full_name);
            //     console.log(` Success Commits fetch for ${repo.full_name}`);
            //     await this.sleep(1000);
            // } catch (error: any) {
            //     console.error(`  ❌ Error commits for ${repo.full_name}:`, error.message);
            // }
            // try {
            //   await this.fetchAndSaveCommitActivity(repo.github_id, repo.full_name);
            //   console.log(` Success Activity fetch for ${repo.full_name}`);
            //   await this.sleep(2000); // 2s gap
            // } catch (error) {
            //   console.error(`  ❌ Error updating commit activity for ${repo.full_name}:`, error);
            // }
            try {
              await this.fetchAndSaveContributors(repo.github_id, repo.full_name);
              console.log(`  ✓ Contributors updated for ${repo.full_name}`);
              await this.sleep(1500); // Respect rate limits (REST + potential GraphQL)
            } catch (error: any) {
              console.error(`  ❌ Error contributors for ${repo.full_name}:`, error.message);
            }
        }
    } finally {
        client.release();
    }

    console.log('\n✅ All Repositories detailed where fetched !');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new WorkerService();
