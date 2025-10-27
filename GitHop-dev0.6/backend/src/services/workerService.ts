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

  /**
   * Update contributors for all repositories (or specific ones)
   */
  public async updateContributors(repositoryId?: number): Promise<void> {
    console.log('🔄 Starting contributors update...');
    
    const client = await pool.connect();
    try {
      // Get repositories to update
      const query = repositoryId 
        ? 'SELECT id, full_name FROM repositories WHERE id = $1'
        : 'SELECT id, full_name FROM repositories LIMIT 300'; // Process in batches
      
      const { rows } = await pool.query(query, repositoryId ? [repositoryId] : []);

      for (const repo of rows) {
        try {
          // Use the new hybrid fetch method
          await this.fetchAndSaveContributors(repo.id, repo.full_name);
          await this.sleep(1000); // Rate limit protection
        } catch (error) {
          console.error(`Error updating contributors for ${repo.full_name}:`, error);
        }
      }
      
      console.log('✅ Contributors update completed!');
    } finally {
      client.release();
    }
  }

  /**
   * Update commit activity for all repositories (or specific ones)
   */
  public async updateCommitActivity(repositoryId?: number): Promise<void> {
    // ... (This function remains unchanged)
    console.log('🔄 Starting commit activity update...');
    
    const client = await pool.connect();
    try {
      const query = repositoryId 
        ? 'SELECT id, full_name FROM repositories WHERE id = $1'
        : 'SELECT id, full_name FROM repositories LIMIT 300';
      
      const { rows } = await pool.query(query, repositoryId ? [repositoryId] : []);

      for (const repo of rows) {
        try {
          await this.fetchAndSaveCommitActivity(repo.id, repo.full_name);
          await this.sleep(1000);
        } catch (error) {
          console.error(`Error updating commit activity for ${repo.full_name}:`, error);
        }
      }
      
      console.log('✅ Commit activity update completed!');
    } finally {
      client.release();
    }
  }

  /**
   * HYBRID: Fetch and save contributors from GitHub API.
   * Tries REST API for all-time stats first.
   * Falls back to GraphQL (recent stats) for massive repos.
   */
  private async fetchAndSaveContributors(repoId: number, fullName: string): Promise<void> {
    
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
      console.error(`  [Fetch Error] Failed to fetch contributors for ${fullName}: ${fetchError.message}`);
      throw fetchError; // Network error, etc.
    }

    if (response.ok) {
      // --- SUCCESS (REST API) ---
      // console.log(`  [REST] Fetched all-time contributors for ${fullName}`);
      const contributors = await response.json();
      // *** UPDATED: Pass 'all_time' to the save function ***
      await this.saveContributorsToDB(repoId, contributors, null, 'all_time');
      return;
    }

    // --- FAILURE (REST API) ---
    if (response.status === 403) {
      const errorData = await response.json();
      // Check for the specific "too large" error
      if (errorData.message?.includes("list is too large")) {
        
        // --- FALLBACK (GraphQL) ---
        console.warn(`  [Info] ${fullName} contributor list is too large. Falling back to recent commit history.`);
        try {
          await this.fetchAndSaveRecentContributorsGraphQL(repoId, fullName);
        } catch (graphQlError: any) {
          console.error(`  [GraphQL Fallback Error] Failed to fetch recent contributors for ${fullName}: ${graphQlError.message}`);
        }
        return;
      }
    }
    
    // --- OTHER HTTP ERROR (404, 500, etc.) ---
    throw new Error(`Failed to fetch contributors (${fullName}): ${response.status} ${response.statusText}`);
  }

  /**
   * METHOD 2 (FALLBACK): Fetch and save contributors from commit history (GraphQL).
   */
  private async fetchAndSaveRecentContributorsGraphQL(repoId: number, fullName: string): Promise<void> {
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
    const maxPages = 5; // Fetch up to 500 commits

    for (let i = 0; i < maxPages && hasNextPage; i++) {
      try {
        const data: any = await this.graphqlClient.request(query, { owner, name, cursor });
        const history = data.repository?.defaultBranchRef?.target?.history;
        if (!history) break;

        for (const node of history.nodes) {
          const user = node.author?.user;
          if (user && user.databaseId) { // Ensure user is not null
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
         // If repo is empty or not found, just stop.
         if (error.message?.includes('404') || error.message?.includes('MISSING')) {
           console.warn(`  [GraphQL] Skipping contributors for ${fullName} (repo not found or empty).`);
           return;
         }
         throw error; // Rethrow other GraphQL errors
      }
    }

    if (contributorsMap.size === 0) {
      console.log(`  [GraphQL] No recent contributors found for ${fullName}.`);
      return;
    }

    const sortedContributors = Array.from(contributorsMap.values())
      .sort((a, b) => b.contributions - a.contributions)
      .slice(0, 30);
      
    // *** UPDATED: Pass 'recent' to the save function ***
    await this.saveContributorsToDB(repoId, sortedContributors, 'User', 'recent');
  }

  /**
   * SHARED: Database logic to save contributor list.
   * *** UPDATED: Now accepts 'dataType' and updates repository_stats. ***
   */
  private async saveContributorsToDB(
    repoId: number, 
    contributors: any[], 
    fallbackType: string | null,
    dataType: 'all_time' | 'recent' // <-- NEW ARGUMENT
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete old contributors
      await client.query('DELETE FROM repository_contributors WHERE repository_id = $1', [repoId]);

      // Insert new contributors
      for (const contributor of contributors) {
        if (!contributor || !contributor.login) continue; // Skip null contributors
        
        await client.query(
          `INSERT INTO repository_contributors 
           (repository_id, github_id, login, avatar_url, html_url, contributions, type, fetched_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT (repository_id, github_id) DO UPDATE SET
             contributions = EXCLUDED.contributions,
             fetched_at = NOW()`,
          [
            repoId,
            contributor.id || contributor.databaseId, // REST 'id', GraphQL 'databaseId'
            contributor.login,
            contributor.avatar_url || contributor.avatarUrl, // REST 'avatar_url', GraphQL 'avatarUrl'
            contributor.html_url || contributor.htmlUrl, // REST 'html_url', GraphQL 'htmlUrl'
            contributor.contributions,
            contributor.type || fallbackType, // REST provides 'type', GraphQL fallback
          ]
        );
      }

      // *** NEW QUERY: Update the stats table atomically ***
      await client.query(
        `UPDATE repository_stats 
         SET contributors_data_type = $1
         WHERE repository_id = $2`,
        [dataType, repoId]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`  [DB Error] Failed to save contributors for repo ${repoId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }


  /**
   * Fetch and save commit activity from GitHub API
   */
  private async fetchAndSaveCommitActivity(repoId: number, fullName: string): Promise<void> {
    // ... (This function remains unchanged)
    const response = await fetch(
      `https://api.github.com/repos/${fullName}/stats/commit_activity`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    if (!response.ok) {
      // 202 means stats are being computed, not an error
      if (response.status === 202) {
        console.log(`  [Info] Commit activity for ${fullName} is being computed by GitHub. Will try again later.`);
        return;
      }
      throw new Error(`Failed to fetch commit activity: ${response.status}`);
    }

    const activityData = await response.json();

    if (!Array.isArray(activityData) || activityData.length === 0) {
      return; // No data available
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete old activity data
      await client.query('DELETE FROM repository_commit_activity WHERE repository_id = $1', [repoId]);

      // Insert new activity data
      for (const week of activityData) {
        const weekDate = new Date(week.week * 1000);
        
        await client.query(
          `INSERT INTO repository_commit_activity 
           (repository_id, week_timestamp, week_date, total_commits, fetched_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (repository_id, week_timestamp) DO UPDATE SET
             total_commits = EXCLUDED.total_commits,
             fetched_at = NOW()`,
          [repoId, week.week, weekDate, week.total]
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

  /**
   * Run all background jobs
   */
  public async runAllJobs(): Promise<void> {
    console.log('🚀 Starting all background jobs...');
    await this.updateContributors();
    await this.updateCommitActivity();
    console.log('✅ All background jobs completed!');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new WorkerService();
