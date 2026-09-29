import { BigQuery } from '@google-cloud/bigquery';
import { GraphQLClient, gql } from 'graphql-request';
import pool from '../db.js';
import { GitHubRepo } from '../types/models.js';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

class NewService {
  private bigquery: BigQuery | null = null;
  private graphqlClient: GraphQLClient;

  constructor() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN is not set.');
    this.graphqlClient = new GraphQLClient(GITHUB_GRAPHQL_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCP_PROJECT_ID) {
      try { this.bigquery = new BigQuery(); }
      catch (e) { console.error("⚠️ Failed to initialize BigQuery.", e); }
    }
  }

  // ===========================================================================
  // PUBLIC SYNC METHODS
  // ===========================================================================

  public async syncWeekly(): Promise<void> {
    await this.syncTrendsFromGHArchive(7, 'trending_weekly');
  }

  public async syncMonthly(): Promise<void> {
    await this.syncTrendsFromGHArchive(30, 'trending_monthly');
  }

  public async syncQuarterly(): Promise<void> {
    await this.syncTrendsFromGHArchive(90, 'trending_quarterly');
  }

  // ===========================================================================
  // CORE LOGIC: BIGQUERY -> GRAPHQL -> DB
  // ===========================================================================

  /**
   * 1. Query BigQuery for "new and hot" repos (High stars, recent growth)
   * 2. Calls fetchDetailsAndSave to enrich and store them.
   */
  public async syncTrendsFromGHArchive(days: number, categoryTag: string): Promise<void> {
    if (!this.bigquery) {
      console.error("❌ BigQuery client not initialized. Check credentials.");
      return;
    }

    console.log(`🔥 [GH Archive] Querying BigQuery for ${days}-day trends...`);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    // Format: YYMMDD (Matches table suffix day.20YYMMDD)
    const startSuffix = startDate.toISOString().split('T')[0].replace(/-/g, '').slice(2);
    const endSuffix = endDate.toISOString().split('T')[0].replace(/-/g, '').slice(2);

    // SQL: Find repos with most WatchEvents (Stars) in range
    const query = `
      SELECT
        repo.name as full_name,
        COUNT(*) as star_count
      FROM \`githubarchive.day.20*\`
      WHERE
        _TABLE_SUFFIX BETWEEN @startSuffix AND @endSuffix
        AND type = 'WatchEvent'
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 100
    `;

    try {
      const [job] = await this.bigquery.createQueryJob({ query, params: { startSuffix, endSuffix } });
      const [rows] = await job.getQueryResults();

      console.log(`   ✅ [GH Archive] Found ${rows.length} trending repos.`);
      if (rows.length === 0) return;

      // Map BigQuery results to a temporary array
      // We store 'star_count' as 'growthCount' to distinguish it from total stars
      const rawRepos = rows.map((row: any) => ({
        full_name: row.full_name,
        growthCount: row.star_count
      }));

      await this.fetchDetailsAndSave(rawRepos, categoryTag);

    } catch (error: any) {
      console.error("❌ [GH Archive] Failed:", error.message);
    }
  }

  /**
   * 1. Enriches the raw list with full metadata from GitHub GraphQL API.
   * 2. Saves the data to 'repositories' table.
   * 3. Saves the specific growth metrics to 'repository_stats' table.
   */
  private async fetchDetailsAndSave(rawRepos: any[], category: string): Promise<void> {
    console.log(`   ✨ Enriching ${rawRepos.length} repos...`);

    // Create a Map for O(1) lookup of growth stats: 'owner/name' -> growthCount
    const growthMap = new Map<string, number>();
    rawRepos.forEach(r => growthMap.set(r.full_name, r.growthCount));

    // 1. Get full details from GitHub
    const detailedRepos = await this.enrichWithGraphQL(rawRepos);
    const validRepos = detailedRepos.filter((repo: any) => repo && repo.databaseId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      console.log(`   🧹 Clearing '${category}' tag...`);
      await client.query(`UPDATE repositories SET categories = array_remove(categories, $1) WHERE $1 = ANY(categories)`, [category]);

      console.log(`   💾 Upserting ${validRepos.length} records...`);

      // 2. Save Repo Data (Main Table + Languages)
      await this.batchInsertToTable(client, validRepos, category);

      // 3. Save Growth Stats (The Critical Fix for Sorting)
      await this.calculateAndSaveStats(client, validRepos, category, growthMap);

      await client.query('COMMIT');
      console.log(`   ✅ Synced ${category} successfully.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Updates 'repository_stats' with the specific growth metric (e.g., stars_growth_7d)
   * derived from BigQuery data.
   */
  private async calculateAndSaveStats(
    client: any,
    repos: GitHubRepo[],
    category: string,
    growthMap: Map<string, number>
  ): Promise<void> {

    // Determine which column to update based on the category
    let growthColumn = '';
    if (category === 'trending_weekly') growthColumn = 'stars_growth_7d';
    else if (category === 'trending_monthly') growthColumn = 'stars_growth_30d';
    else if (category === 'trending_quarterly') growthColumn = 'stars_growth_90d';

    for (const repo of repos) {
      const pushedAt = repo.pushedAt || (repo as any).pushed_at;
      const daysSinceCommit = pushedAt ? Math.floor((Date.now() - new Date(pushedAt).getTime()) / (1000 * 60 * 60 * 24)) : null;

      const latestRelease = repo.releases?.nodes?.[0];
      const daysSinceRelease = latestRelease?.publishedAt ? Math.floor((Date.now() - new Date(latestRelease.publishedAt).getTime()) / (1000 * 60 * 60 * 24)) : null;
      const totalReleases = repo.releases?.totalCount || 0;

      const activityScore = this.calculateSimpleActivityScore(repo, daysSinceCommit);
      const healthScore = this.calculateSimpleHealthScore(repo, daysSinceCommit);

      // Retrieve the specific growth count for this repo
      const growthCount = growthMap.get(repo.nameWithOwner) || 0;

      // Dynamic Query Construction to update the correct growth column
      let updateSnippet = '';
      let insertColSnippet = '';
      let insertValSnippet = '';

      if (growthColumn) {
        insertColSnippet = `, ${growthColumn}`;
        insertValSnippet = `, $10`; // $10 corresponds to growthCount
        updateSnippet = `, ${growthColumn} = $10`;
      }

      const query = `
        INSERT INTO repository_stats (
          repo_github_id, commits_last_year, days_since_last_commit, days_since_last_release,
          latest_release_tag, latest_release_date, total_releases, activity_score, health_score, calculated_at
          ${insertColSnippet}
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() ${insertValSnippet})
        ON CONFLICT (repo_github_id) DO UPDATE SET
          commits_last_year = EXCLUDED.commits_last_year,
          days_since_last_commit = EXCLUDED.days_since_last_commit,
          days_since_last_release = EXCLUDED.days_since_last_release,
          latest_release_tag = EXCLUDED.latest_release_tag,
          latest_release_date = EXCLUDED.latest_release_date,
          total_releases = EXCLUDED.total_releases,
          activity_score = EXCLUDED.activity_score,
          health_score = EXCLUDED.health_score,
          calculated_at = NOW()
          ${updateSnippet}
      `;

      const params = [
        repo.databaseId,
        repo.defaultBranchRef?.target?.history?.totalCount || 0,
        daysSinceCommit,
        daysSinceRelease,
        latestRelease?.tagName,
        latestRelease?.publishedAt,
        totalReleases,
        activityScore,
        healthScore
      ];

      if (growthColumn) params.push(growthCount); // Add the 10th parameter

      await client.query(query, params);
    }
  }

  // ===========================================================================
  // PRIVATE HELPER METHODS
  // ===========================================================================

  private async enrichWithGraphQL(simpleRepos: any[]): Promise<any[]> {
    const query = gql`
      query FetchRepos($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          databaseId, name, nameWithOwner, owner { login, avatarUrl, __typename }, description, url, homepageUrl,
          stargazerCount, forkCount, watchers { totalCount }, issues(states: OPEN) { totalCount },
          diskUsage, primaryLanguage { name },
          repositoryTopics(first: 10) { nodes { topic { name } } },
          languages(first: 10, orderBy: {field: SIZE, direction: DESC}) { edges { size, node { name } }, totalSize },
          licenseInfo { name, key }, createdAt, updatedAt, pushedAt,
          isFork, isArchived, isDisabled, forkingAllowed, isTemplate, visibility,
          hasIssuesEnabled, hasProjectsEnabled, hasWikiEnabled, hasDiscussionsEnabled,
          defaultBranchRef { name, target { ... on Commit { history(first: 1) { totalCount } } } },
          releases(first: 1, orderBy: {field: CREATED_AT, direction: DESC}) { totalCount, nodes { tagName, publishedAt } },
          readme: object(expression: "HEAD:README.md") { ... on Blob { text } }
        }
      }
    `;

    let allRepos: any[] = [];
    for (const repo of simpleRepos) {
      try {
        const fullName = repo.full_name || repo.nameWithOwner;
        if (!fullName || !fullName.includes('/')) continue;
        const [owner, name] = fullName.split('/');
        const res: any = await this.graphqlClient.request(query, { owner, name });
        if (res.repository && res.repository.databaseId) {
          allRepos.push(res.repository);
        }
        await this.sleep(200);
      } catch (error: any) { console.warn(`   ⚠️ Enrichment skipped for ${repo.full_name}`); }
    }
    return allRepos;
  }

  private async batchInsertToTable(client: any, repos: GitHubRepo[], category: string): Promise<void> {
    for (const repo of repos) {
      const topics = repo.repositoryTopics?.nodes?.map(t => t.topic.name) || [];
      const rawReadme = (repo as any).readme?.text || "";
      const readmeSnippet = rawReadme.slice(0, 10000);

      // 1. Insert Repository
      await client.query(
        `INSERT INTO repositories (
          github_id, name, full_name, owner_login, owner_avatar_url, description, html_url, homepage_url,
          stars_count, forks_count, watchers_count, open_issues_count, size_kb, language, topics, license_name,
          created_at, updated_at, pushed_at, is_fork, is_archived, is_disabled, allow_forking, is_template,
          visibility, has_issues, has_projects, has_downloads, has_wiki, has_pages, has_discussions,
          default_branch, subscribers_count, network_count, last_fetched, categories, sync_status, readme_snippet
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, NOW(), ARRAY[$35], 'complete', $36)
        ON CONFLICT (github_id) DO UPDATE SET
          name = EXCLUDED.name, full_name = EXCLUDED.full_name, owner_login = EXCLUDED.owner_login,
          owner_avatar_url = EXCLUDED.owner_avatar_url, description = EXCLUDED.description,
          stars_count = EXCLUDED.stars_count, forks_count = EXCLUDED.forks_count,
          watchers_count = EXCLUDED.watchers_count, open_issues_count = EXCLUDED.open_issues_count,
          created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at, pushed_at = EXCLUDED.pushed_at,
          topics = EXCLUDED.topics, readme_snippet = EXCLUDED.readme_snippet,
          categories = array_append(array_remove(repositories.categories, $35), $35),
          sync_status = 'complete', last_fetched = NOW()`,
        [
          repo.databaseId, repo.name, repo.nameWithOwner || (repo as any).full_name, repo.owner.login, repo.owner.avatarUrl || (repo.owner as any).avatar_url, repo.description, repo.url || (repo as any).html_url, repo.homepageUrl || (repo as any).homepage,
          repo.stargazerCount || (repo as any).stargazers_count, repo.forkCount || (repo as any).forks_count, repo.watchers?.totalCount || (repo as any).watchers_count || 0, repo.issues?.totalCount || (repo as any).open_issues_count || 0, repo.diskUsage || (repo as any).size || 0, repo.primaryLanguage?.name || (repo as any).language, topics, repo.licenseInfo?.name || (repo as any).license?.name,
          repo.createdAt || (repo as any).created_at, repo.updatedAt || (repo as any).updated_at, repo.pushedAt || (repo as any).pushed_at,
          repo.isFork || (repo as any).fork, repo.isArchived || (repo as any).archived, repo.isDisabled || (repo as any).disabled, repo.forkingAllowed || (repo as any).allow_forking, repo.isTemplate || (repo as any).is_template, repo.visibility,
          repo.hasIssuesEnabled || (repo as any).has_issues, repo.hasProjectsEnabled || (repo as any).has_projects, true, repo.hasWikiEnabled || (repo as any).has_wiki, false, repo.hasDiscussionsEnabled || (repo as any).has_discussions,
          repo.defaultBranchRef?.name || (repo as any).default_branch || 'main', repo.watchers?.totalCount || 0, repo.forkCount, category, readmeSnippet
        ]
      );

      // 2. Insert Languages
      if (repo.languages?.edges && repo.languages.edges.length > 0) {
        await client.query('DELETE FROM repository_languages WHERE repo_github_id = $1', [repo.databaseId]);
        for (const lang of repo.languages.edges) {
          const percentage = repo.languages.totalSize > 0
            ? (lang.size / repo.languages.totalSize) * 100
            : 0;
          await client.query(
            `INSERT INTO repository_languages (repo_github_id, language_name, bytes_count, percentage)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (repo_github_id, language_name) DO UPDATE SET
               bytes_count = EXCLUDED.bytes_count,
               percentage = EXCLUDED.percentage`,
            [repo.databaseId, lang.node.name, lang.size, percentage]
          );
        }
      }
    }
  }

  private calculateSimpleActivityScore(repo: GitHubRepo, daysSinceCommit: number | null): number {
    let score = 0;
    const stars = repo.stargazerCount || (repo as any).stargazers_count || 0;
    score += Math.log10(stars + 1) * 10;
    if (daysSinceCommit !== null && daysSinceCommit <= 30) score += 50;
    return Math.round(score);
  }

  private calculateSimpleHealthScore(repo: GitHubRepo, daysSinceCommit: number | null): number {
    return daysSinceCommit !== null && daysSinceCommit < 30 ? 100 : 50;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new NewService();
