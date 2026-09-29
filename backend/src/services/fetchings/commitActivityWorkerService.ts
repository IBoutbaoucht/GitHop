import pool from '../../db.js';

class CommitActivityWorkerService {

  public async updateMissingCommitActivity(limit = 50): Promise<void> {
    console.log(`🔄 [Activity] Updating MISSING commit activity (Limit: ${limit})...`);

    // Select repos where commit_activity_fetched is false/null
    const { rows } = await pool.query(`
      SELECT r.id, r.github_id, r.full_name
      FROM repositories r
      LEFT JOIN repository_stats rs ON r.github_id = rs.repo_github_id
      WHERE r.sync_status = 'complete'
      AND (rs.commit_activity_fetched IS FALSE OR rs.commit_activity_fetched IS NULL)
      ORDER BY r.stars_count DESC
      LIMIT $1
    `, [limit]);

    if (rows.length === 0) {
        console.log("   No missing commit activity to update.");
        return;
    }

    for (const repo of rows) {
      try {
        await this.fetchAndSaveCommitActivity(repo.github_id, repo.full_name);
        await this.sleep(1500); // Standard delay
      } catch (error: any) {
        console.error(`  ❌ Error updating commit activity for ${repo.full_name}:`, error.message);
      }
    }
  }

  private async fetchAndSaveCommitActivity(repoGithubId: string, fullName: string): Promise<void> {
    const maxRetries = 3;
    let attempt = 0;
    let response: Response | null = null;

    while (attempt < maxRetries) {
      try {
        response = await fetch(
          `https://api.github.com/repos/${fullName}/stats/commit_activity`,
          { headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } }
        );

        if (response.ok) break;

        if (response.status === 202) {
          console.log(`  ⏳ GitHub computing stats for ${fullName}. Retrying...`);
          await this.sleep(2000);
          attempt++;
          continue;
        }
        throw new Error(`Failed to fetch activity: ${response.status}`);
      } catch (error) { throw error; }
    }

    if (!response || !response.ok) return;

    const activityData = await response.json();
    if (!Array.isArray(activityData)) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Mark as fetched
      await client.query(`
        INSERT INTO repository_stats (repo_github_id, commit_activity_fetched)
        VALUES ($1, TRUE)
        ON CONFLICT (repo_github_id) DO UPDATE SET commit_activity_fetched = TRUE
      `, [repoGithubId]);

      // Clear old data
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
      console.log(`  ✓ Activity saved for ${fullName}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new CommitActivityWorkerService();
