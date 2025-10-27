export interface Repository {
  id: number;
  github_id: number;
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
  repository_id: number;
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
  calculated_at: string;
}

export interface RepositoryLanguage {
  id: number;
  repository_id: number;
  language_name: string;
  bytes_count: number;
  percentage: number;
}

export interface EnrichedRepository extends Repository {
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