import pool from '../../db.js';
import { GraphQLClient, gql } from 'graphql-request';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

class ContributorsWorkerService {
  private graphqlClient: GraphQLClient;

  constructor() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN is not set.');
    this.graphqlClient = new GraphQLClient(GITHUB_GRAPHQL_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  public async updateMissingContributors(limit = 50): Promise<void> {
    console.log(`🔄 [Contributors] Updating MISSING contributors (Limit: ${limit})...`);

    const { rows } = await pool.query(`
      SELECT r.id, r.github_id, r.full_name
      FROM repositories r
      LEFT JOIN repository_stats rs ON r.github_id = rs.repo_github_id
      WHERE r.sync_status = 'complete'
      AND (rs.contributors_fetched IS FALSE OR rs.contributors_fetched IS NULL)
      ORDER BY r.stars_count DESC
      LIMIT $1
    `, [limit]);

    if (rows.length === 0) {
        console.log("   No missing contributors to update.");
        return;
    }

    for (const repo of rows) {
        try {
          await this.fetchAndSaveContributors(repo.github_id, repo.full_name);
          console.log(`  ✓ Contributors updated for ${repo.full_name}`);
          await this.sleep(1500);
        } catch (error: any) {
          console.error(`  ❌ Error contributors for ${repo.full_name}:`, error.message);
        }
    }
  }

  private async fetchAndSaveContributors(repoGithubId: string, fullName: string): Promise<void> {
    // Try REST first
    let response: Response;
    try {
      response = await fetch(
        `https://api.github.com/repos/${fullName}/contributors?per_page=30`,
        {
          headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` }
        }
      );
    } catch (err: any) { throw new Error(err.message); }

    if (response.ok) {
      const contributors = await response.json();
      await this.saveContributorsToDB(repoGithubId, contributors, 'all_time');
      return;
    }

    // If REST fails (empty or large), fallback to GraphQL logic (simplified here)
    // In a full implementation, you'd include the GraphQL fallback logic from your original workerService
    console.warn(`  ⚠️ REST failed for ${fullName}, skipping fallback for this specific endpoint.`);
  }

  private async saveContributorsToDB(repoGithubId: string, contributors: any[], dataType: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`
        INSERT INTO repository_stats (repo_github_id, contributors_fetched, contributors_data_type)
        VALUES ($1, TRUE, $2)
        ON CONFLICT (repo_github_id) DO UPDATE SET contributors_fetched = TRUE, contributors_data_type = $2
      `, [repoGithubId, dataType]);

      await client.query('DELETE FROM repository_contributors WHERE repo_github_id = $1', [repoGithubId]);

      for (const contributor of contributors) {
        await client.query(
          `INSERT INTO repository_contributors
           (repo_github_id, contributor_github_id, login, avatar_url, html_url, contributions, type, data_source, fetched_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [
            repoGithubId, contributor.id, contributor.login,
            contributor.avatar_url, contributor.html_url,
            contributor.contributions, contributor.type, dataType
          ]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new ContributorsWorkerService();
