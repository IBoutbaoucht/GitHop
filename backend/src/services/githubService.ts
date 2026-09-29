import { GraphQLClient, gql } from 'graphql-request';
import pool from '../db.js';
import { GitHubRepo } from '../types/models.js';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';
const GITHUB_REQUEST_DELAY_MS = 1000;

class GitHubService {
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
  // 1. RAW DATA FETCHING (Search API)
  // ===========================================================================

  public fetchTrendingRepos = async () => {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    const trendingRepos = await fetch(
      `https://api.github.com/search/repositories?` +
      `q=pushed:>${oneWeekAgo} stars:>1000&` +
      `sort=stars&order=desc&per_page=100`,
      { headers: { 'Authorization': `token ${process.env.GITHUB_TOKEN}` }}
    ).then(r => r.json());

    if (!trendingRepos.items) return [];

    return trendingRepos.items.slice(0, 100);
  };

  public fetchGrowingRepos = async () => {
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    const newHotRepos = await fetch(
      `https://api.github.com/search/repositories?` +
      `q=created:>${oneMonthAgo} stars:>100&` +
      `sort=stars&order=desc&per_page=100`,
      { headers: { 'Authorization': `token ${process.env.GITHUB_TOKEN}` }}
    ).then(r => r.json());

    if (!newHotRepos.items) return [];

    return newHotRepos.items
      .map((repo: any) => {
        const ageInDays = (Date.now() - new Date(repo.created_at).getTime())
          / (1000 * 60 * 60 * 24);
        const growthScore = repo.stargazers_count / Math.max(ageInDays, 1);
        return { ...repo, growthScore };
      })
      .sort((a: any, b: any) => b.growthScore - a.growthScore)
      .slice(0, 100);
  };

  // ===========================================================================
  // 2. ORCHESTRATION & SYNC METHODS
  // ===========================================================================

  public async SaveGrowingRepositories(): Promise<void> {
    console.log("🌱 Starting GROWING repos fetch...");
    try {
      const rawRepos = await this.fetchGrowingRepos();
      await this.fetchDetailsAndSave(rawRepos, 'growing');
      console.log("✅ Growing repos saved successfully.");
    } catch (error: any) {
      console.error("❌ Failed to save growing repos:", error.message);
    }
  }

  public async SaveTrendingRepositories(): Promise<void> {
    console.log("🔥 Starting TRENDING repos fetch...");
    try {
      const rawRepos = await this.fetchTrendingRepos();
      await this.fetchDetailsAndSave(rawRepos, 'trending');
      console.log("✅ Trending repos saved successfully.");
    } catch (error: any) {
      console.error("❌ Failed to save trending repos:", error.message);
    }
  }

  public async syncQuick(): Promise<void> {
    console.log("🚀 Starting QUICK sync (TOPS - 300 repos)...");
    await this.fetchTopReposWithCursor(300);
    console.log("✅ Quick sync completed!");
  }

  public async syncComprehensive(): Promise<void> {
    console.log("🚀 Starting COMPREHENSIVE sync (TOPS - 1000 repos)...");
    await this.fetchTopReposWithCursor(1000);
    console.log("✅ Comprehensive sync completed!");
  }

  // ===========================================================================
  // 3. CORE LOGIC: DETAILS & SAVING
  // ===========================================================================

  public async fetchDetailsAndSave(rawRepos: any[], category: 'growing' | 'trending' | 'trending_weekly' | 'trending_monthly' | 'trending_quarterly' ): Promise<void> {
    // Enrich raw REST data with GraphQL details to get topics, precise counts, etc.
    const detailedRepos = await this.enrichWithGraphQL(rawRepos);
    const validRepos: GitHubRepo[] = detailedRepos.filter(
      (repo: any) => repo && repo.databaseId
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Fresh Start: Clean the specific tag from all repos to ensure the list is current
      console.log(`   🧹 Clearing '${category}' tag from old records...`);
      await client.query(`
        UPDATE repositories
        SET categories = array_remove(categories, $1)
        WHERE $1 = ANY(categories)
      `, [category]);

      console.log(`   💾 Upserting ${validRepos.length} new '${category}' records...`);
      await this.batchInsertToTable(client, validRepos, category);
      await this.calculateAndSaveStats(validRepos);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async fetchTopReposWithCursor(totalLimit: number): Promise<void> {
    const batchSize = 20;
    let cursor: string | null = null;
    let fetchedTotal = 0;

    while (fetchedTotal < totalLimit) {
      const remaining = Math.min(batchSize, totalLimit - fetchedTotal);

      try {
        const { repos, nextCursor, hasNext } = await this.fetchBatchWithCursor(remaining, cursor);

        if (repos.length > 0) {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            await this.batchInsertToTable(client, repos, 'top');
            await this.calculateAndSaveStats(repos);
            await client.query('COMMIT');
          } catch (err) {
            await client.query('ROLLBACK');
            throw err;
          } finally {
            client.release();
          }

          fetchedTotal += repos.length;
          console.log(`  ✓ Fetched & Saved ${fetchedTotal}/${totalLimit} repos`);
        }

        if (!hasNext || repos.length < remaining) break;

        cursor = nextCursor;
        await this.sleep(GITHUB_REQUEST_DELAY_MS);

      } catch (error: any) {
        console.error(`  ❌ Error at position ${fetchedTotal}:`, error.message);
        if (error.message?.includes('rate limit') || error.message?.includes('429')) {
          console.warn("  ⏳ Hit rate limit. Sleeping for 60 seconds...");
          await this.sleep(60000);
          continue;
        }
        break;
      }
    }
  }

  // ===========================================================================
  // 4. DATABASE OPERATIONS (Upsert Logic)
  // ===========================================================================

  private async batchInsertToTable(client: any, repos: GitHubRepo[], category: string): Promise<void> {
    for (const repo of repos) {
      const topics = repo.repositoryTopics?.nodes?.map(t => t.topic.name) || [];

      const avatarUrl = repo.owner.avatarUrl || (repo.owner as any).avatar_url;
      const login = repo.owner.login;
      const createdAt = repo.createdAt || (repo as any).created_at;
      const updatedAt = repo.updatedAt || (repo as any).updated_at;
      const pushedAt = repo.pushedAt || (repo as any).pushed_at;
      const license = repo.licenseInfo?.name || (repo as any).license?.name;

      // --- NEW: Process README ---
      const rawReadme = (repo as any).readme?.text || "";
      const readmeSnippet = rawReadme.slice(0, 10000); // Truncate to 10k

      await client.query(
        `INSERT INTO repositories (
          github_id, name, full_name, owner_login, owner_avatar_url,
          description, html_url, homepage_url,
          stars_count, forks_count, watchers_count, open_issues_count,
          size_kb, language, topics, license_name,
          created_at, updated_at, pushed_at,
          is_fork, is_archived, is_disabled, allow_forking, is_template,
          visibility, has_issues, has_projects, has_downloads, has_wiki, has_pages, has_discussions,
          default_branch, subscribers_count, network_count,
          last_fetched, categories, sync_status, readme_snippet
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
          $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34,
          NOW(), ARRAY[$35], 'complete', $36
        )
        ON CONFLICT (github_id) DO UPDATE SET
          name = EXCLUDED.name,
          full_name = EXCLUDED.full_name,
          owner_login = EXCLUDED.owner_login,
          owner_avatar_url = EXCLUDED.owner_avatar_url,
          description = EXCLUDED.description,
          stars_count = EXCLUDED.stars_count,
          forks_count = EXCLUDED.forks_count,
          watchers_count = EXCLUDED.watchers_count,
          open_issues_count = EXCLUDED.open_issues_count,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at,
          pushed_at = EXCLUDED.pushed_at,
          topics = EXCLUDED.topics,
          readme_snippet = EXCLUDED.readme_snippet, -- Update Readme
          categories = array_append(array_remove(repositories.categories, $35), $35),
          sync_status = 'complete',
          last_fetched = NOW()`,
        [
          repo.databaseId,
          repo.name,
          repo.nameWithOwner || (repo as any).full_name,
          login,
          avatarUrl,
          repo.description,
          repo.url || (repo as any).html_url,
          repo.homepageUrl || (repo as any).homepage,
          repo.stargazerCount || (repo as any).stargazers_count,
          repo.forkCount || (repo as any).forks_count,
          repo.watchers?.totalCount || (repo as any).watchers_count || 0,
          repo.issues?.totalCount || (repo as any).open_issues_count || 0,
          repo.diskUsage || (repo as any).size || 0,
          repo.primaryLanguage?.name || (repo as any).language,
          topics,
          license,
          createdAt,
          updatedAt,
          pushedAt,
          repo.isFork || (repo as any).fork,
          repo.isArchived || (repo as any).archived,
          repo.isDisabled || (repo as any).disabled,
          repo.forkingAllowed || (repo as any).allow_forking,
          repo.isTemplate || (repo as any).is_template,
          repo.visibility,
          repo.hasIssuesEnabled || (repo as any).has_issues,
          repo.hasProjectsEnabled || (repo as any).has_projects,
          true,
          repo.hasWikiEnabled || (repo as any).has_wiki,
          false,
          repo.hasDiscussionsEnabled || (repo as any).has_discussions,
          repo.defaultBranchRef?.name || (repo as any).default_branch || 'main',
          repo.watchers?.totalCount || 0,
          repo.forkCount,
          category,
          readmeSnippet // <--- $36
        ]
      );

      // Save Languages
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

  private async calculateAndSaveStats(repos: GitHubRepo[]): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const repo of repos) {
        // Handle date parsing safely
        const pushedAt = repo.pushedAt || (repo as any).pushed_at;
        const daysSinceCommit = pushedAt
          ? Math.floor((Date.now() - new Date(pushedAt).getTime()) / (1000 * 60 * 60 * 24))
          : null;

        const latestRelease = repo.releases?.nodes?.[0];
        const daysSinceRelease = latestRelease?.publishedAt
          ? Math.floor((Date.now() - new Date(latestRelease.publishedAt).getTime()) / (1000 * 60 * 60 * 24))
          : null;

        const totalReleases = repo.releases?.totalCount || 0;

        const activityScore = this.calculateSimpleActivityScore(repo, daysSinceCommit);
        const healthScore = this.calculateSimpleHealthScore(repo, daysSinceCommit);

        await client.query(
          `INSERT INTO repository_stats (
            repo_github_id,
            commits_last_year,
            days_since_last_commit,
            days_since_last_release,
            latest_release_tag,
            latest_release_date,
            total_releases,
            activity_score,
            health_score,
            calculated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (repo_github_id) DO UPDATE SET
            commits_last_year = EXCLUDED.commits_last_year,
            days_since_last_commit = EXCLUDED.days_since_last_commit,
            days_since_last_release = EXCLUDED.days_since_last_release,
            latest_release_tag = EXCLUDED.latest_release_tag,
            latest_release_date = EXCLUDED.latest_release_date,
            total_releases = EXCLUDED.total_releases,
            activity_score = EXCLUDED.activity_score,
            health_score = EXCLUDED.health_score,
            calculated_at = NOW()`,
          [
            repo.databaseId,
            repo.defaultBranchRef?.target?.history?.totalCount || 0,
            daysSinceCommit,
            daysSinceRelease,
            latestRelease?.tagName,
            latestRelease?.publishedAt,
            totalReleases,
            activityScore,
            healthScore
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error("Error calculating stats:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ===========================================================================
  // 5. GRAPHQL QUERY HELPERS
  // ===========================================================================

  private async enrichWithGraphQL(simpleRepos: any[]): Promise<any[]> {
    const query = gql`
      query FetchRepos($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          databaseId
          name
          nameWithOwner
          owner { login, avatarUrl, __typename }
          description
          url
          homepageUrl
          stargazerCount
          forkCount
          watchers { totalCount }
          issues(states: OPEN) { totalCount }
          diskUsage
          primaryLanguage { name }
          repositoryTopics(first: 10) { nodes { topic { name } } }
          languages(first: 10, orderBy: {field: SIZE, direction: DESC}) { edges { size, node { name } }, totalSize }
          licenseInfo { name, key }
          createdAt
          updatedAt
          pushedAt
          isFork
          isArchived
          isDisabled
          forkingAllowed
          isTemplate
          visibility
          hasIssuesEnabled
          hasProjectsEnabled
          hasWikiEnabled
          hasDiscussionsEnabled
          defaultBranchRef {
            name
            target { ... on Commit { history(first: 1) { totalCount } } }
          }
          releases(first: 1, orderBy: {field: CREATED_AT, direction: DESC}) {
            totalCount
            nodes { tagName, publishedAt }
          }
          # NEW: Fetch Readme
          readme: object(expression: "HEAD:README.md") {
            ... on Blob { text }
          }
        }
      }
    `;

    let allRepos: any[] = [];
    // Process sequentially to respect strict rate limits, or in small parallel batches
    for (const repo of simpleRepos) {
      try {
        // Handle input that might be snake_case (REST) or camelCase
        const fullName = repo.full_name || repo.nameWithOwner;
        if (!fullName) continue;

        const [owner, name] = fullName.split('/');
        const res: any = await this.graphqlClient.request(query, { owner, name });
        if (res.repository && res.repository.databaseId) {
          allRepos.push(res.repository);
        }
        // Important: Delay to avoid secondary rate limit on GraphQL
        await this.sleep(300);
      } catch (error) {
        console.warn(`⚠️ Enrichment skipped for ${repo.full_name}: REST fallback may be used.`);
      }
    }
    return allRepos;
  }

  private async fetchBatchWithCursor(
    limit: number,
    cursor: string | null
  ): Promise<{ repos: GitHubRepo[]; nextCursor: string | null; hasNext: boolean }> {
    const query = gql`
      query GetTopRepos($limit: Int!, $cursor: String) {
        search(query: "stars:>1 sort:stars-desc", type: REPOSITORY, first: $limit, after: $cursor) {
          pageInfo { endCursor, hasNextPage }
          nodes {
            ... on Repository {
              databaseId
              name
              nameWithOwner
              owner { login, avatarUrl, __typename }
              description
              url
              homepageUrl
              stargazerCount
              forkCount
              watchers { totalCount }
              issues(states: OPEN) { totalCount }
              diskUsage
              primaryLanguage { name }
              repositoryTopics(first: 10) { nodes { topic { name } } }
              languages(first: 10, orderBy: {field: SIZE, direction: DESC}) { edges { size, node { name } }, totalSize }
              licenseInfo { name, key }
              createdAt
              updatedAt
              pushedAt
              isFork
              isArchived
              isDisabled
              forkingAllowed
              isTemplate
              visibility
              hasIssuesEnabled
              hasProjectsEnabled
              hasWikiEnabled
              hasDiscussionsEnabled
              defaultBranchRef {
                name
                target { ... on Commit { history(first: 1) { totalCount } } }
              }
              releases(first: 1, orderBy: {field: CREATED_AT, direction: DESC}) {
                totalCount
                nodes { tagName, publishedAt }
              }
              # NEW: Fetch Readme
              readme: object(expression: "HEAD:README.md") {
                ... on Blob { text }
              }
            }
          }
        }
      }
    `;

    const data: any = await this.graphqlClient.request(query, { limit, cursor });
    const repos = data.search.nodes.filter((repo: any) => repo?.databaseId);

    return {
      repos,
      nextCursor: data.search.pageInfo.endCursor,
      hasNext: data.search.pageInfo.hasNextPage
    };
  }

  // --- SCORING ---

  private calculateSimpleActivityScore(repo: GitHubRepo, daysSinceCommit: number | null): number {
    let score = 0;
    // Use safe accessors for potentially missing properties if falling back to REST data
    const stars = repo.stargazerCount || (repo as any).stargazers_count || 0;
    const forks = repo.forkCount || (repo as any).forks_count || 0;
    const issues = repo.issues?.totalCount || (repo as any).open_issues_count || 0;

    score += Math.log10(stars + 1) * 100;
    score += Math.log10(forks + 1) * 50;

    if (daysSinceCommit !== null) {
      if (daysSinceCommit <= 7) score += 200;
      else if (daysSinceCommit <= 30) score += 100;
      else if (daysSinceCommit <= 90) score += 50;
      else if (daysSinceCommit > 365) score *= 0.5;
    }

    score += Math.min(issues, 100) * 0.5;
    return Math.round(score * 100) / 100;
  }

  private calculateSimpleHealthScore(repo: GitHubRepo, daysSinceCommit: number | null): number {
    let score = 50;
    if (daysSinceCommit !== null) {
      if (daysSinceCommit <= 7) score += 30;
      else if (daysSinceCommit <= 30) score += 20;
      else if (daysSinceCommit <= 90) score += 10;
      else if (daysSinceCommit > 365) score -= 20;
    }

    // Safe access for REST fallback
    const hasIssues = repo.hasIssuesEnabled ?? (repo as any).has_issues;
    const hasDiscussions = repo.hasDiscussionsEnabled ?? (repo as any).has_discussions;
    const issuesCount = repo.issues?.totalCount ?? (repo as any).open_issues_count ?? 0;
    const isArchived = repo.isArchived ?? (repo as any).archived;
    const isDisabled = repo.isDisabled ?? (repo as any).disabled;

    if (repo.releases?.nodes?.[0]) {
      const releaseAge = Math.floor(
        (Date.now() - new Date(repo.releases.nodes[0].publishedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (releaseAge <= 90) score += 10;
    }

    if (hasIssues && issuesCount > 0) score += 5;
    if (hasDiscussions) score += 5;
    if (isArchived || isDisabled) score = 0;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new GitHubService();
