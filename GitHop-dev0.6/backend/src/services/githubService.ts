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
    // console.log(token)
    this.graphqlClient = new GraphQLClient(GITHUB_GRAPHQL_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  public async syncQuick(): Promise<void> {
    console.log("🚀 Starting QUICK sync (top 300 repos with full details)...");
    await this.fetchTopReposWithCursor(300);
    console.log("✅ Quick sync completed!");
  }

  public async syncComprehensive(): Promise<void> {
    console.log("🚀 Starting COMPREHENSIVE sync (top 1000 repos with full details)...");
    await this.fetchTopReposWithCursor(1000);
    console.log("✅ Comprehensive sync completed!");
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
          await this.batchSaveRepositories(repos);
          await this.calculateAndSaveStats(repos);
          fetchedTotal += repos.length;
          console.log(`  ✓ Fetched ${fetchedTotal}/${totalLimit} repos`);
        }
        
        if (!hasNext || repos.length < remaining) {
          console.log(`  ℹ️ Reached end of available results at ${fetchedTotal} repos`);
          break;
        }
        
        cursor = nextCursor;
        await this.sleep(GITHUB_REQUEST_DELAY_MS);
        
      } catch (error: any) {
        console.error(`  ❌ Error at position ${fetchedTotal}:`, error.message);
        
        if (error.message?.includes('rate limit')) {
          console.log('  ⏳ Rate limited. Waiting 60 seconds...');
          await this.sleep(60000);
          continue;
        }
        
        if (error.message?.includes('502') || 
            error.message?.includes('504') ||
            error.message?.includes('Bad Gateway') ||
            error.message?.includes('Premature close')) {
          console.log('  ⏳ GitHub API temporary error. Waiting 10 seconds and retrying...');
          await this.sleep(10000);
          continue;
        }
        
        throw error;
      }
    }
  }

  private async fetchBatchWithCursor(
    limit: number, 
    cursor: string | null
  ): Promise<{ repos: GitHubRepo[]; nextCursor: string | null; hasNext: boolean }> {
    const query = gql`
      query GetTopRepos($limit: Int!, $cursor: String) {
        search(query: "stars:>1 sort:stars-desc", type: REPOSITORY, first: $limit, after: $cursor) {
          pageInfo {
            endCursor
            hasNextPage
          }
          nodes {
            ... on Repository {
              databaseId
              name
              nameWithOwner
              owner {
                login
                avatarUrl
                __typename
              }
              description
              url
              homepageUrl
              stargazerCount
              forkCount
              watchers { totalCount }
              issues(states: OPEN) { totalCount }
              diskUsage
              primaryLanguage { name }
              repositoryTopics(first: 10) {
                nodes {
                  topic { name }
                }
              }
              languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                edges {
                  size
                  node { name }
                }
                totalSize
              }
              licenseInfo {
                name
                key
              }
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
                target {
                  ... on Commit {
                    history(first: 1) {
                      totalCount
                    }
                  }
                }
              }
              releases(first: 1, orderBy: {field: CREATED_AT, direction: DESC}) {
                totalCount
                nodes {
                  tagName
                  publishedAt
                }
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

  private async batchSaveRepositories(repos: GitHubRepo[]): Promise<void> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const repo of repos) {
        const topics = repo.repositoryTopics?.nodes?.map(t => t.topic.name) || [];
        
        const repoResult = await client.query(
          `INSERT INTO repositories (
            github_id, name, full_name, owner_login, owner_avatar_url, owner_type,
            description, html_url, homepage_url,
            stars_count, forks_count, watchers_count, open_issues_count,
            size_kb, language, topics,
            license_name, license_key,
            created_at, updated_at, pushed_at,
            is_fork, is_archived, is_disabled, allow_forking, is_template,
            visibility, has_issues, has_projects, has_downloads, has_wiki, has_pages, has_discussions,
            default_branch, subscribers_count, network_count,
            last_fetched
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
            $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34,
            $35, $36, NOW()
          )
          ON CONFLICT (github_id) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            stars_count = EXCLUDED.stars_count,
            forks_count = EXCLUDED.forks_count,
            watchers_count = EXCLUDED.watchers_count,
            open_issues_count = EXCLUDED.open_issues_count,
            size_kb = EXCLUDED.size_kb,
            language = EXCLUDED.language,
            topics = EXCLUDED.topics,
            updated_at = EXCLUDED.updated_at,
            pushed_at = EXCLUDED.pushed_at,
            is_archived = EXCLUDED.is_archived,
            is_disabled = EXCLUDED.is_disabled,
            has_issues = EXCLUDED.has_issues,
            has_wiki = EXCLUDED.has_wiki,
            has_pages = EXCLUDED.has_pages,
            has_discussions = EXCLUDED.has_discussions,
            last_fetched = NOW()
          RETURNING id`,
          [
            repo.databaseId,
            repo.name,
            repo.nameWithOwner,
            repo.owner.login,
            repo.owner.avatarUrl,
            repo.owner.__typename,
            repo.description,
            repo.url,
            repo.homepageUrl,
            repo.stargazerCount,
            repo.forkCount,
            repo.watchers?.totalCount || 0,
            repo.issues?.totalCount || 0,
            repo.diskUsage || 0,
            repo.primaryLanguage?.name,
            topics,
            repo.licenseInfo?.name,
            repo.licenseInfo?.key,
            repo.createdAt,
            repo.updatedAt,
            repo.pushedAt,
            repo.isFork,
            repo.isArchived,
            repo.isDisabled,
            repo.forkingAllowed,
            repo.isTemplate,
            repo.visibility,
            repo.hasIssuesEnabled,
            repo.hasProjectsEnabled,
            true,
            repo.hasWikiEnabled,
            false,
            repo.hasDiscussionsEnabled,
            repo.defaultBranchRef?.name || 'main',
            repo.watchers?.totalCount || 0,
            repo.forkCount
          ]
        );
        
        const repoId = repoResult.rows[0].id;
        
        if (repo.languages?.edges && repo.languages.edges.length > 0) {
          await client.query('DELETE FROM repository_languages WHERE repository_id = $1', [repoId]);
          
          for (const lang of repo.languages.edges) {
            const percentage = repo.languages.totalSize > 0 
              ? (lang.size / repo.languages.totalSize) * 100 
              : 0;
            
            await client.query(
              `INSERT INTO repository_languages (repository_id, language_name, bytes_count, percentage)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (repository_id, language_name) DO UPDATE SET
                 bytes_count = EXCLUDED.bytes_count,
                 percentage = EXCLUDED.percentage`,
              [repoId, lang.node.name, lang.size, percentage]
            );
          }
        }
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error("Error in batch save, rolling back transaction.", error);
      throw error;
    } finally {
      client.release();
    }
  }

  private async calculateAndSaveStats(repos: GitHubRepo[]): Promise<void> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const repo of repos) {
        const repoResult = await client.query(
          'SELECT id FROM repositories WHERE github_id = $1',
          [repo.databaseId]
        );
        
        if (repoResult.rows.length === 0) continue;
        const repoId = repoResult.rows[0].id;
        
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
            repository_id,
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
          ON CONFLICT (repository_id) DO UPDATE SET
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
            repoId,
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
      console.error("Error calculating stats, rolling back.", error);
      throw error;
    } finally {
      client.release();
    }
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
    
    if (repo.isArchived) score = 0;
    if (repo.isDisabled) score = 0;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new GitHubService();