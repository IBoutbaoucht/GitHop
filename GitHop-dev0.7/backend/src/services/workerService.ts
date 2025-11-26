import pool from '../db.js';
import { GraphQLClient, gql } from 'graphql-request';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

class WorkerService {
  private graphqlClient: GraphQLClient;

  constructor() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GITHUB_TOKEN is not set.');
    }
    this.graphqlClient = new GraphQLClient(GITHUB_GRAPHQL_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

 // ===========================================================================
  // 1. STUB HYDRATION (The Full Fetch)
  // ===========================================================================

  public async hydrateStubs(): Promise<void> {
    console.log('🔄 Hydrating Stub Repositories...');
    
    const BATCH_SIZE = 100; // Increased limit as requested
    
    // Fetch stubs that haven't been fully synced yet
    const { rows } = await pool.query(`
        SELECT id, github_id, full_name 
        FROM repositories_index 
        WHERE sync_status = 'stub' 
        LIMIT $1
    `, [BATCH_SIZE]);

    if (rows.length === 0) {
        console.log("   No stubs to hydrate.");
        return;
    }

    console.log(`   Found ${rows.length} stubs to hydrate.`);

    for (const row of rows) {
        try {
            console.log(`   💧 Hydrating ${row.full_name}...`);
            
            // 1. Fetch FULL details from GitHub
            await this.fetchAndEnrichRepo(row.github_id, row.full_name);
            
            // 2. Mark as complete
            await pool.query(`
                UPDATE repositories_index 
                SET sync_status = 'complete', last_synced_at = NOW() 
                WHERE id = $1
            `, [row.id]);
            
            await this.sleep(500); // Short pause to respect rate limits
        } catch (e: any) {
            console.error(`   ❌ Failed to hydrate ${row.full_name}:`, e.message);
        }
    }
    console.log('✅ Hydration batch complete.');
  }

  /**
   * Fetches ALL repository details to ensure repositories_index matches 'tops' table structure.
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
            releases(first: 1, orderBy: {field: CREATED_AT, direction: DESC}) { totalCount, nodes { tagName, publishedAt } }
          }
        }
      `;

      let data: any;
      try {
        data = await this.graphqlClient.request(query, { owner, name });
      } catch (e) { return; }

      const repo = data.repository;
      if (!repo) return;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // 1. Update the Index Table with FULL details (Description, Topics, etc.)
        // This ensures the UI shows rich data, not just an empty card.
        const topics = repo.repositoryTopics?.nodes?.map((t:any) => t.topic.name) || [];
        
        await client.query(
          `UPDATE repositories_index SET
             name = $2, full_name = $3, owner_login = $4, owner_avatar_url = $5, description = $6,
             html_url = $7, homepage_url = $8, stars_count = $9, forks_count = $10, watchers_count = $11,
             open_issues_count = $12, size_kb = $13, language = $14, topics = $15, license_name = $16,
             created_at = $17, updated_at = $18, pushed_at = $19,
             is_fork = $20, is_archived = $21, is_disabled = $22, allow_forking = $23, is_template = $24,
             visibility = $25, has_issues = $26, has_projects = $27, has_downloads = $28, has_wiki = $29,
             has_pages = $30, has_discussions = $31, default_branch = $32, last_fetched = NOW()
           WHERE github_id = $1`,
          [
            githubId, repo.name, repo.nameWithOwner, repo.owner.login, repo.owner.avatarUrl, repo.description,
            repo.url, repo.homepageUrl, repo.stargazerCount, repo.forkCount, repo.watchers.totalCount,
            repo.issues.totalCount, repo.diskUsage, repo.primaryLanguage?.name, topics, repo.licenseInfo?.name,
            repo.createdAt, repo.updatedAt, repo.pushedAt,
            repo.isFork, repo.isArchived, repo.isDisabled, repo.forkingAllowed, repo.isTemplate,
            repo.visibility, repo.hasIssuesEnabled, repo.hasProjectsEnabled, true, repo.hasWikiEnabled,
            false, repo.hasDiscussionsEnabled, repo.defaultBranchRef?.name
          ]
        );

        // 2. Save Languages (Linked Table)
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

        // 3. Save Stats (Linked Table)
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
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
  }


  // --- NEW: STUB HYDRATION ---
  public async syncStubRepositories(): Promise<void> {
      console.log("🔄 Hydrating Stub Repositories...");
      
      // 1. Fetch up to 10 stubs to process
      const { rows } = await pool.query(`
          SELECT id, full_name 
          FROM repositories_index 
          WHERE sync_status = 'stub' 
          LIMIT 10
      `);

      if (rows.length === 0) {
          console.log("   No stubs to hydrate.");
          return;
      }

      for (const row of rows) {
          try {
              console.log(`   Hydrating ${row.full_name}...`);
              // We reuse the GitHub Service's logic but target our index table
              // NOTE: You might need to expose a public method in githubService that accepts a table name
              // OR, simpler: just manually fetch here.
              
              // Let's fetch details
              const [owner, name] = row.full_name.split('/');
              // Assume we have a helper to get full details (reuse githubService.enrichWithGraphQL logic)
              // For now, I'll mark it queued to simulate work
              
              // Ideally:
              // const details = await githubService.fetchSingleRepoDetails(owner, name);
              // await githubService.saveToTable(details, 'repositories_index');
              
              await pool.query(`UPDATE repositories_index SET sync_status = 'complete', last_fetched = NOW() WHERE id = $1`, [row.id]);
          } catch (e) {
              console.error(`   Failed to hydrate ${row.full_name}`, e);
          }
      }
  }

  // ===========================================================================
  // 1. CONTRIBUTORS WORKER
  // ===========================================================================

  /**
   * Update contributors for a specific category of repositories.
   * @param repoType The table name ('tops', 'growings', 'trendings')
   * @param repositoryId Optional local ID to update a specific repo
   */
  public async updateContributors(repoType = 'tops', repositoryId?: number): Promise<void> {
    console.log(`🔄 Starting contributors update for table: ${repoType}...`);
    
    const client = await pool.connect();
    try {
      // Fetch 'github_id' (the shared link) and 'full_name'
      const query = repositoryId 
        ? `SELECT id, github_id, full_name FROM ${repoType} WHERE id = $1`
        : `SELECT id, github_id, full_name FROM ${repoType} LIMIT 300`; 
      
      const { rows } = await pool.query(query, repositoryId ? [repositoryId] : []);

      for (const repo of rows) {
        try {
          // Pass github_id as the key for metrics
          await this.fetchAndSaveContributors(repo.github_id, repo.full_name);
          console.log(`  ✓ Contributors updated for ${repo.full_name}`);
          await this.sleep(1000); // Rate limit protection
        } catch (error: any) {
          console.error(`  ❌ Error updating contributors for ${repo.full_name}:`, error.message);
        }
      }
      
      console.log(`✅ Contributors update completed for ${repoType}!`);
    } finally {
      client.release();
    }
  }

  /**
   * HYBRID: Fetch and save contributors. Tries REST first, falls back to GraphQL.
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
      // --- SUCCESS (REST API) ---
      const contributors = await response.json();
      await this.saveContributorsToDB(repoGithubId, contributors, null, 'all_time');
      return;
    }

    // --- FAILURE (REST API) ---
    if (response.status === 403) {
      const errorData = await response.json();
      // Check for specific "list too large" error requiring GraphQL fallback
      if (errorData.message?.includes("list is too large")) {
        console.warn(`  [Info] ${fullName} contributor list is too large. Falling back to GraphQL.`);
        try {
          await this.fetchAndSaveRecentContributorsGraphQL(repoGithubId, fullName);
        } catch (graphQlError: any) {
          console.error(`  [GraphQL Error] Failed fallback for ${fullName}: ${graphQlError.message}`);
        }
        return;
      }
    }
    
    throw new Error(`Failed to fetch contributors: ${response.status} ${response.statusText}`);
  }

/**
   * METHOD 2 (FALLBACK): Fetch contributors from recent history, then ENRICH totals using Search API.
   */
private async fetchAndSaveRecentContributorsGraphQL(repoGithubId: string, fullName: string): Promise<void> {
    const [owner, name] = fullName.split('/');
    
    const query = gql`
      query GetRecentContributors($owner: String!, $name: String!, $cursor: String) {
        repository(owner: $owner, name: $name) {
          defaultBranchRef {
            target {
              ... on Commit {
                history(first: 100, after: $cursor) {
                  pageInfo { endCursor, hasNextPage }
                  nodes {
                    author {
                      user { databaseId, login, avatarUrl, htmlUrl: url }
                    }
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
    const maxPages = 5; 

    console.log(`  [GraphQL] Scanning recent history for ${fullName}...`);

    for (let i = 0; i < maxPages && hasNextPage; i++) {
      try {
        const data: any = await this.graphqlClient.request(query, { owner, name, cursor });
        const history = data.repository?.defaultBranchRef?.target?.history;
        if (!history) break;

        for (const node of history.nodes) {
          const user = node.author?.user;
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
         if (error.message?.includes('404') || error.message?.includes('MISSING')) {
           return;
         }
         console.error(`  [GraphQL Error] Page ${i}: ${error.message}`);
      }
    }

    if (contributorsMap.size === 0) return;

    // 1. Get the list of active contributors (up to 30)
    let sortedContributors = Array.from(contributorsMap.values())
      .sort((a, b) => b.contributions - a.contributions)
      .slice(0, 30); 

    // 2. Enrich ALL of them with true all-time counts
    console.log(`  [Enrichment] Fetching all-time totals for ALL ${sortedContributors.length} active contributors...`);
    
    const enrichedContributors = [];
    
    // We process sequentially to respect the 30 req/min search limit strictly
    for (const contributor of sortedContributors) {
      try {
        // Rate limit protection (Wait 2s between requests to be safe)
        await this.sleep(2000);

        const totalCount = await this.fetchUserTotalCommits(fullName, contributor.login);
        
        if (totalCount > contributor.contributions) {
            contributor.contributions = totalCount;
        }
      } catch (e) {
        console.warn(`    Failed to enrich ${contributor.login}, keeping recent count.`);
      }
      enrichedContributors.push(contributor);
    }

    // 3. Re-sort based on the new real totals
    sortedContributors = enrichedContributors.sort((a, b) => b.contributions - a.contributions);

    // 4. Save to DB
    // We keep the flag as 'recent' because the *list* of users is still just the recently active ones,
    // even if their commit counts are now all-time.
    await this.saveContributorsToDB(repoGithubId, sortedContributors, 'User', 'recent');
  }

  /**
   * Helper: Fetch total commit count for a specific user in a repo using Search API
   */
  private async fetchUserTotalCommits(fullName: string, login: string): Promise<number> {
    try {
      const res = await fetch(
        `https://api.github.com/search/commits?q=repo:${fullName}+author:${login}&per_page=1`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.cloak-preview'
          }
        }
      );

      if (res.ok) {
        const data = await res.json();
        return data.total_count || 0;
      }
      return 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * SHARED: Database logic to save contributor list using repo_github_id.
   */
  private async saveContributorsToDB(repoGithubId: string, contributors: any[], fallbackType: string | null, dataType: 'all_time' | 'recent'): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Update metadata in repository_stats
      await client.query(
        'UPDATE repository_stats SET contributors_data_type = $1 WHERE repo_github_id = $2',
        [dataType, repoGithubId]
      );

      // 2. Delete old contributors for this GitHub ID
      await client.query('DELETE FROM repository_contributors WHERE repo_github_id = $1', [repoGithubId]);

      // 3. Insert new contributors
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
            repoGithubId,         // The Repository
            contributorGithubId,  // The User
            contributor.login,
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
  // 2. COMMIT ACTIVITY WORKER
  // ===========================================================================

  public async updateCommitActivity(repoType = 'tops', repositoryId?: number): Promise<void> {
    console.log(`🔄 Starting commit activity update for table: ${repoType}...`);
    
    const client = await pool.connect();
    try {
      const query = repositoryId 
        ? `SELECT id, github_id, full_name FROM ${repoType} WHERE id = $1`
        : `SELECT id, github_id, full_name FROM ${repoType} LIMIT 300`;
      
      const { rows } = await pool.query(query, repositoryId ? [repositoryId] : []);

      for (const repo of rows) {
        try {
          await this.fetchAndSaveCommitActivity(repo.github_id, repo.full_name);
          await this.sleep(2000);
        } catch (error) {
          console.error(`  ❌ Error updating commit activity for ${repo.full_name}:`, error);
        }
      }
      
      console.log(`✅ Commit activity update completed for ${repoType}!`);
    } finally {
      client.release();
    }
  }

// Replace this method in src/services/workerService.ts

  private async fetchAndSaveCommitActivity(repoGithubId: string, fullName: string): Promise<void> {
    const maxRetries = 3; // Try 3 times
    let attempt = 0;
    let response: Response | null = null;

    while (attempt < maxRetries) {
      try {
        response = await fetch(
          `https://api.github.com/repos/${fullName}/stats/commit_activity`,
          {
            headers: {
              'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          }
        );

        // If we get a 200 OK, break the loop and process data
        if (response.ok) {
          break;
        }

        // If we get a 202 Accepted (Calculating), wait and retry
        if (response.status === 202) {
          console.log(`  ⏳ GitHub is computing stats for ${fullName}. Retrying in 2s... (${attempt + 1}/${maxRetries})`);
          await this.sleep(2000); // Wait 2 seconds before retrying
          attempt++;
          continue;
        }

        // If it's another error (404, 403, 500), throw immediately
        throw new Error(`Failed to fetch commit activity: ${response.status} ${response.statusText}`);

      } catch (error) {
        // If it was a network error, we might want to throw or retry. 
        // Here we throw to let the outer loop handle logging.
        throw error;
      }
    }

    // Final check after loop
    if (!response || !response.ok) {
      // If we exhausted retries on 202, or failed otherwise
      console.warn(`  ⚠️ Could not fetch activity for ${fullName} after ${attempt} attempts.`);
      return;
    }

    const activityData = await response.json();
    if (!Array.isArray(activityData) || activityData.length === 0) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete old activity data using repo_github_id
      await client.query('DELETE FROM repository_commit_activity WHERE repo_github_id = $1', [repoGithubId]);

      // Insert new activity data
      for (const week of activityData) {
        const weekDate = new Date(week.week * 1000);
        
        await client.query(
          `INSERT INTO repository_commit_activity 
           (repo_github_id, week_timestamp, week_date, total_commits, fetched_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (repo_github_id, week_timestamp) DO UPDATE SET
             total_commits = EXCLUDED.total_commits,
             fetched_at = NOW()`,
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
  // 3. RECENT COMMITS WORKER
  // ===========================================================================

  public async updateRecentCommits(repoType = 'tops', repositoryId?: number): Promise<void> {
    console.log(`🔄 Starting recent commits update for table: ${repoType}...`);
    
    const client = await pool.connect();
    try {
      const query = repositoryId 
        ? `SELECT id, github_id, full_name FROM ${repoType} WHERE id = $1`
        : `SELECT id, github_id, full_name FROM ${repoType} LIMIT 300`;
      
      const { rows } = await pool.query(query, repositoryId ? [repositoryId] : []);

      for (const repo of rows) {
        try {
          await this.fetchAndSaveRecentCommits(repo.github_id, repo.full_name);
          await this.sleep(1000); 
        } catch (error: any) {
          console.error(`  ❌ Error updating commits for ${repo.full_name}:`, error.message);
        }
      }
      
      console.log(`✅ Recent commits update completed for ${repoType}!`);
    } finally {
      client.release();
    }
  }

  private async fetchAndSaveRecentCommits(repoGithubId: string, fullName: string): Promise<void> {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${fullName}/commits?per_page=50`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      if (!response.ok) {
        if (response.status === 409 || response.status === 404) return; // Empty or Not Found
        throw new Error(`Failed to fetch commits: ${response.status}`);
      }

      const commits = await response.json();
      if (!Array.isArray(commits) || commits.length === 0) return;

      await this.saveCommitsToDB(repoGithubId, commits);
      console.log(`  ✓ Saved ${commits.length} commits for ${fullName}`);

    } catch (error: any) {
      throw error;
    }
  }

  private async saveCommitsToDB(repoGithubId: string, commits: any[]): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete old commits for this repo using repo_github_id
      await client.query('DELETE FROM repository_commits WHERE repo_github_id = $1', [repoGithubId]);

      // Insert new commits
      for (const commit of commits) {
        if (!commit.sha || !commit.commit) continue;

        const author = commit.author || {};
        const commitData = commit.commit;
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
  }

  // ===========================================================================
  // 4. JOB ORCHESTRATION
  // ===========================================================================

  /**
   * Run all background jobs for all categories
   */


  public async runAllJobs(): Promise<void> {
    console.log('🚀 Starting ALL background jobs...');
    
    // 1. First, hydrate any new stubs found by the Developer Scout
    await this.hydrateStubs();

    // 2. Then run standard maintenance on key tables
    const categories = ['tops', 'growings', 'trendings', 'repositories_index']; // Added index

      await this.updateRecentCommits('repositories_index');
      await this.updateCommitActivity('repositories_index');
      await this.updateContributors('repositories_index');

    // for (const category of categories) {
    //   console.log(`\n--- Processing Category: ${category.toUpperCase()} ---`);
    //   await this.updateRecentCommits(category);
    //   await this.updateCommitActivity(category);
    //   await this.updateContributors(category);
    // }

    console.log('\n✅ All background jobs completed successfully!');
  }

  public async updateCommitActivityGrowings() {
      await this.updateCommitActivity('growings');
  }

  // public async frunAllJobs(): Promise<void> {
  //   console.log('🚀 Starting ALL background jobs...');
    
  //   const categories = ['tops', 'growings', 'trendings'];

  //   for (const category of categories) {
  //     console.log(`\n--- Processing Category: ${category.toUpperCase()} ---`);
  //     await this.updateRecentCommits(category);
  //     await this.updateCommitActivity(category);
  //     await this.updateContributors(category);
  //   }

  //   console.log('\n✅ All background jobs completed successfully!');
  // }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new WorkerService();