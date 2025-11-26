export interface Repository {
  id: number;
  github_id: number; // This is now the universal link
  name: string;
  full_name: string;
  owner_login: string;
  owner_avatar_url?: string;
  owner_type?: string;
  description?: string;
  html_url: string;
  homepage_url?: string;
  stars_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  size_kb: number;
  language?: string;
  topics?: string[];
  license_name?: string;
  license_key?: string;
  created_at: string;
  updated_at: string;
  pushed_at?: string;
  is_fork: boolean;
  is_archived: boolean;
  is_disabled: boolean;
  allow_forking: boolean;
  is_template: boolean;
  visibility: string;
  has_issues: boolean;
  has_projects: boolean;
  has_downloads: boolean;
  has_wiki: boolean;
  has_pages: boolean;
  has_discussions: boolean;
  default_branch: string;
  subscribers_count: number;
  network_count: number;
  last_fetched: string;
}

export interface RepositoryStats {
  id: number;
  repo_github_id: number; // FIXED: Was repository_id
  commits_last_month: number;
  commits_last_year: number;
  issues_closed_last_month: number;
  pull_requests_merged_last_month: number;
  stars_growth_30d: number;
  forks_growth_30d: number;
  contributors_count: number;
  activity_score: number;
  health_score: number;
  avg_issue_close_time_days?: number;
  avg_pr_merge_time_days?: number;
  days_since_last_commit?: number;
  days_since_last_release?: number;
  latest_release_tag?: string;
  latest_release_date?: string;
  total_releases: number;
  contributors_data_type: 'all_time' | 'recent'; // ADDED: To match DB
  calculated_at: string;
}

export interface RepositoryLanguage {
  id: number;
  repo_github_id: number; // FIXED: Was repository_id
  language_name: string;
  bytes_count: number;
  percentage: number;
}

// ADDED: Missing model for Contributors
export interface RepositoryContributor {
  id: number;
  repo_github_id: number;
  contributor_github_id: number;
  login: string;
  avatar_url?: string;
  html_url?: string;
  contributions: number;
  type?: string;
  data_source?: string;
  fetched_at: string;
}

// ADDED: Missing model for Commit Activity
export interface RepositoryCommitActivity {
  id: number;
  repo_github_id: number;
  week_timestamp: number;
  week_date: string;
  total_commits: number;
  fetched_at: string;
}

export interface EnrichedRepository extends Repository {
  // These fields come from the JOIN with RepositoryStats
  commits_last_month?: number;
  commits_last_year?: number;
  activity_score?: number;
  health_score?: number;
  stars_growth_30d?: number;
  contributors_count?: number;
  days_since_last_commit?: number;
  latest_release_tag?: string;
  latest_release_date?: string;
  total_releases?: number;
  // Added source table so frontend knows which API to call or how to label it
  source_table?: 'tops' | 'growings' | 'trendings'; 
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor?: {
    lastStars: number;
    lastId: number;
  } | null;
  hasMore: boolean;
}

export interface PageInfo {
  endCursor?: string | null;
  hasNextPage: boolean;
}

export interface GitHubRepo {
  databaseId: number;
  name: string;
  nameWithOwner: string;
  owner: {
    login: string;
    avatarUrl: string;
    __typename: string;
  };
  description?: string;
  url: string;
  homepageUrl?: string;
  stargazerCount: number;
  forkCount: number;
  watchers: { totalCount: number };
  issues: { totalCount: number };
  diskUsage: number;
  primaryLanguage?: { name: string };
  repositoryTopics: {
    nodes: Array<{ topic: { name: string } }>;
  };
  languages: {
    edges: Array<{
      size: number;
      node: { name: string };
    }>;
    totalSize: number;
  };
  licenseInfo?: {
    name: string;
    key: string;
  };
  createdAt: string;
  updatedAt: string;
  pushedAt?: string;
  isFork: boolean;
  isArchived: boolean;
  isDisabled: boolean;
  forkingAllowed: boolean;
  isTemplate: boolean;
  visibility: string;
  hasIssuesEnabled: boolean;
  hasProjectsEnabled: boolean;
  hasDownloads: boolean;
  hasWikiEnabled: boolean;
  hasPages: boolean;
  hasDiscussionsEnabled: boolean;
  defaultBranchRef?: {
    name: string;
    target: {
      history: {
        totalCount: number;
      };
    };
  };
  releases: {
    totalCount: number;
    nodes: Array<{
      tagName: string;
      publishedAt: string;
    }>;
  };
}