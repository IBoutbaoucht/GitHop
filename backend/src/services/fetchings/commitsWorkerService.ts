import pool from '../../db.js';

class CommitsWorkerService {

  public async updateMissingRecentCommits(limit = 50): Promise<void> {
    console.log(`🔄 [Commits] Updating MISSING recent commits (Limit: ${limit})...`);

    const { rows } = await pool.query(`
      SELECT r.id, r.github_id, r.full_name
      FROM repositories r
      LEFT JOIN repository_stats rs ON r.github_id = rs.repo_github_id
      WHERE r.sync_status = 'complete'
      AND (rs.recent_commits_fetched IS FALSE OR rs.recent_commits_fetched IS NULL)
      ORDER BY r.stars_count DESC
      LIMIT $1
    `, [limit]);

    if (rows.length === 0) {
        console.log("   No missing commits to update.");
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
  }

  private async fetchAndSaveRecentCommits(repoGithubId: string, fullName: string): Promise<void> {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${fullName}/commits?per_page=30`,
        { headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } }
      );

      if (!response.ok) return;

      const commits = await response.json();
      if (!Array.isArray(commits)) return;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(`
            INSERT INTO repository_stats (repo_github_id, recent_commits_fetched)
            VALUES ($1, TRUE)
            ON CONFLICT (repo_github_id) DO UPDATE SET recent_commits_fetched = TRUE
        `, [repoGithubId]);

        await client.query('DELETE FROM repository_commits WHERE repo_github_id = $1', [repoGithubId]);

        for (const commit of commits) {
          if (!commit.sha || !commit.commit) continue;
          const commitData = commit.commit;

          // Note: Simple list fetch doesn't include detailed stats (additions/deletions)
          // You would need individual fetches for that, which is expensive.

          await client.query(
            `INSERT INTO repository_commits
             (repo_github_id, sha, commit_message, author_name, author_email,
              author_login, author_avatar_url, committer_name, committer_date,
              html_url, fetched_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
            [
              repoGithubId,
              commit.sha,
              commitData.message,
              commitData.author?.name,
              commitData.author?.email,
              commit.author?.login,
              commit.author?.avatar_url,
              commitData.committer?.name,
              commitData.committer?.date,
              commit.html_url
            ]
          );
        }
        await client.query('COMMIT');
        console.log(`  ✓ Commits saved for ${fullName}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } catch (error) { throw error; }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new CommitsWorkerService();
