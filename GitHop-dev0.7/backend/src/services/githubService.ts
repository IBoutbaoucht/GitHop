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
  // 1. FETCHING STRATEGIES
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

    return trendingRepos.items
      .map((repo: any) => {
        return repo;
      })
      .slice(0, 100);
  };

  public fetchGrowingRepos = async () => {
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
        
    const newHotRepos = await fetch(
      `https://api.github.com/search/repositories?` +
      `q=created:>${oneMonthAgo} stars:>100&` +
      `sort=stars&order=desc&per_page=50`,
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
  // 2. PUBLIC SYNC METHODS
  // ===========================================================================

  public async SaveGrowingRepositories(): Promise<void> {
    console.log("🌱 Starting GROWING repos fetch...");
    const rawRepos = await this.fetchGrowingRepos();
    await this.fetchDetailsAndSave(rawRepos, 'growings');
    console.log("✅ Growing repos saved.");
  }

  public async SaveTrendingRepositories(): Promise<void> {
    console.log("🔥 Starting TRENDING repos fetch...");
    const rawRepos = await this.fetchTrendingRepos();
    await this.fetchDetailsAndSave(rawRepos, 'trendings');
    console.log("✅ Trending repos saved.");
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
  // 3. INTERNAL HELPERS
  // ===========================================================================

  private async fetchDetailsAndSave(rawRepos: any[], tableName: 'growings' | 'trendings'): Promise<void> {
    const detailedRepos = await this.enrichWithGraphQL(rawRepos);
    const validRepos: GitHubRepo[] = detailedRepos.filter(
      (repo: any) => repo && repo.databaseId
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`TRUNCATE TABLE ${tableName} CASCADE`); 
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
        
    try {
      await this.batchInsertToTable(client, validRepos, tableName);
      await this.calculateAndSaveStats(validRepos);
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
            await this.batchInsertToTable(client, repos, 'tops');
            await this.calculateAndSaveStats(repos);
          } finally {
            client.release();
          }
          
          fetchedTotal += repos.length;
          console.log(`  ✓ Fetched ${fetchedTotal}/${totalLimit} repos`);
        }
        
        if (!hasNext || repos.length < remaining) break;
        
        cursor = nextCursor;
        await this.sleep(GITHUB_REQUEST_DELAY_MS);
        
      } catch (error: any) {
        console.error(`  ❌ Error at position ${fetchedTotal}:`, error.message);
        if (error.message?.includes('rate limit')) {
          await this.sleep(60000);
          continue;
        }
        break;
      }
    }
  }

  // ===========================================================================
  // 4. BATCH INSERT (FIXED MAPPING)
  // ===========================================================================

  private async batchInsertToTable(client: any, repos: GitHubRepo[], tableName: string): Promise<void> {
    await client.query('BEGIN');
    
    try {
      for (const repo of repos) {
        const topics = repo.repositoryTopics?.nodes?.map(t => t.topic.name) || [];
        
        // FIXED: Removed 'owner_type' and 'license_key' (not in schema)
        // Ensure the values array matches this list exactly.
        await client.query(
          `INSERT INTO ${tableName} (
            github_id, name, full_name, owner_login, owner_avatar_url,
            description, html_url, homepage_url,
            stars_count, forks_count, watchers_count, open_issues_count,
            size_kb, language, topics,
            license_name,
            created_at, updated_at, pushed_at,
            is_fork, is_archived, is_disabled, allow_forking, is_template,
            visibility, has_issues, has_projects, has_downloads, has_wiki, has_pages, has_discussions,
            default_branch, subscribers_count, network_count,
            last_fetched
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
            $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34,
            NOW()
          )
          ON CONFLICT (github_id) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            stars_count = EXCLUDED.stars_count,
            forks_count = EXCLUDED.forks_count,
            watchers_count = EXCLUDED.watchers_count,
            open_issues_count = EXCLUDED.open_issues_count,
            updated_at = EXCLUDED.updated_at,
            pushed_at = EXCLUDED.pushed_at,
            last_fetched = NOW()`,
          [
            repo.databaseId,                // $1
            repo.name,                      // $2
            repo.nameWithOwner,             // $3
            repo.owner.login,               // $4
            repo.owner.avatarUrl,           // $5
            // REMOVED: repo.owner.__typename (owner_type) - Not in schema
            repo.description,               // $6
            repo.url,                       // $7
            repo.homepageUrl,               // $8
            repo.stargazerCount,            // $9
            repo.forkCount,                 // $10
            repo.watchers?.totalCount || 0, // $11
            repo.issues?.totalCount || 0,   // $12
            repo.diskUsage || 0,            // $13
            repo.primaryLanguage?.name,     // $14
            topics,                         // $15
            repo.licenseInfo?.name,         // $16
            // REMOVED: repo.licenseInfo?.key (license_key) - Not in schema
            repo.createdAt,                 // $17
            repo.updatedAt,                 // $18
            repo.pushedAt,                  // $19
            repo.isFork,                    // $20
            repo.isArchived,                // $21
            repo.isDisabled,                // $22
            repo.forkingAllowed,            // $23
            repo.isTemplate,                // $24
            repo.visibility,                // $25
            repo.hasIssuesEnabled,          // $26
            repo.hasProjectsEnabled,        // $27
            true,                           // $28 (has_downloads, assume true)
            repo.hasWikiEnabled,            // $29
            false,                          // $30 (has_pages, default false)
            repo.hasDiscussionsEnabled,     // $31
            repo.defaultBranchRef?.name || 'main', // $32
            repo.watchers?.totalCount || 0, // $33 (using watchers as proxy for subscribers)
            repo.forkCount                  // $34 (using fork count as proxy for network)
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
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error("Error in batch insert:", error);
      throw error;
    }
  }

  private async calculateAndSaveStats(repos: GitHubRepo[]): Promise<void> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const repo of repos) {
        const daysSinceCommit = repo.pushedAt 
          ? Math.floor((Date.now() - new Date(repo.pushedAt).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        
        const daysSinceRelease = repo.releases?.nodes?.[0]?.publishedAt
          ? Math.floor((Date.now() - new Date(repo.releases.nodes[0].publishedAt).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        
        const latestRelease = repo.releases?.nodes?.[0];
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
        }
      }
    `;

    let allRepos: any[] = [];
    for (const repo of simpleRepos) {
      try {
        const [owner, name] = repo.full_name.split('/');
        const res: any = await this.graphqlClient.request(query, { owner, name });
        if (res.repository && res.repository.databaseId) {
          allRepos.push(res.repository);
        }
        await new Promise(resolve => setTimeout(resolve, GITHUB_REQUEST_DELAY_MS));
      } catch (error) {
        console.error(`Failed to fetch details for ${repo.full_name}`);
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

  private calculateSimpleActivityScore(repo: GitHubRepo, daysSinceCommit: number | null): number {
    let score = 0;
    score += Math.log10(repo.stargazerCount + 1) * 100;
    score += Math.log10(repo.forkCount + 1) * 50;
    if (daysSinceCommit !== null) {
      if (daysSinceCommit <= 7) score += 200;
      else if (daysSinceCommit <= 30) score += 100;
      else if (daysSinceCommit <= 90) score += 50;
      else if (daysSinceCommit > 365) score *= 0.5;
    }
    score += Math.min(repo.issues?.totalCount || 0, 100) * 0.5;
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
    if (repo.releases?.nodes?.[0]) {
      const releaseAge = Math.floor(
        (Date.now() - new Date(repo.releases.nodes[0].publishedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (releaseAge <= 90) score += 10;
    }
    if (repo.hasIssuesEnabled && (repo.issues?.totalCount || 0) > 0) score += 5;
    if (repo.hasDiscussionsEnabled) score += 5;
    if (repo.isArchived || repo.isDisabled) score = 0;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new GitHubService();