DROP TABLE IF EXISTS repository_languages CASCADE;
DROP TABLE IF EXISTS repository_stats CASCADE;
DROP TABLE IF EXISTS repository_contributors CASCADE;
DROP TABLE IF EXISTS repository_commit_activity CASCADE;
DROP TABLE IF EXISTS repository_commits CASCADE;
DROP TABLE IF EXISTS background_jobs CASCADE;
DROP TABLE IF EXISTS tops CASCADE;
DROP TABLE IF EXISTS growings CASCADE;
DROP TABLE IF EXISTS trendings CASCADE;

-- 1. TOPS 
CREATE TABLE tops (
  id SERIAL PRIMARY KEY,
  github_id BIGINT UNIQUE NOT NULL,
  full_name VARCHAR(500) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  owner_login VARCHAR(255),
  owner_avatar_url TEXT,
  description TEXT,
  html_url TEXT,
  homepage_url TEXT,
  
  -- Metrics
  stars_count INTEGER DEFAULT 0,
  forks_count INTEGER DEFAULT 0,
  watchers_count INTEGER DEFAULT 0,
  open_issues_count INTEGER DEFAULT 0,
  size_kb INTEGER DEFAULT 0,
  
  -- Content
  language VARCHAR(100),
  topics TEXT[],
  license_name VARCHAR(255),
  
  -- Timestamps
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  pushed_at TIMESTAMPTZ,
  
  -- Status & Features (Restored these columns)
  is_fork BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  is_disabled BOOLEAN DEFAULT FALSE,
  allow_forking BOOLEAN DEFAULT TRUE,
  is_template BOOLEAN DEFAULT FALSE,
  visibility VARCHAR(50) DEFAULT 'public',
  has_issues BOOLEAN DEFAULT TRUE,
  has_projects BOOLEAN DEFAULT TRUE,
  has_downloads BOOLEAN DEFAULT TRUE,
  has_wiki BOOLEAN DEFAULT TRUE,
  has_pages BOOLEAN DEFAULT FALSE,
  has_discussions BOOLEAN DEFAULT FALSE,
  
  default_branch VARCHAR(255),
  subscribers_count INTEGER DEFAULT 0,
  network_count INTEGER DEFAULT 0,
  
  last_fetched TIMESTAMPTZ DEFAULT NOW()
);

-- 2. GROWINGS
CREATE TABLE growings (
  id SERIAL PRIMARY KEY,
  github_id BIGINT UNIQUE NOT NULL,
  full_name VARCHAR(500) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  owner_login VARCHAR(255),
  owner_avatar_url TEXT,
  description TEXT,
  html_url TEXT,
  homepage_url TEXT,
  
  stars_count INTEGER DEFAULT 0,
  forks_count INTEGER DEFAULT 0,
  watchers_count INTEGER DEFAULT 0,
  open_issues_count INTEGER DEFAULT 0,
  size_kb INTEGER DEFAULT 0,
  
  language VARCHAR(100),
  topics TEXT[],
  license_name VARCHAR(255),
  
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  pushed_at TIMESTAMPTZ,
  
  -- Status & Features (Restored)
  is_fork BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  is_disabled BOOLEAN DEFAULT FALSE,
  allow_forking BOOLEAN DEFAULT TRUE,
  is_template BOOLEAN DEFAULT FALSE,
  visibility VARCHAR(50) DEFAULT 'public',
  has_issues BOOLEAN DEFAULT TRUE,
  has_projects BOOLEAN DEFAULT TRUE,
  has_downloads BOOLEAN DEFAULT TRUE,
  has_wiki BOOLEAN DEFAULT TRUE,
  has_pages BOOLEAN DEFAULT FALSE,
  has_discussions BOOLEAN DEFAULT FALSE,
  
  default_branch VARCHAR(255),
  subscribers_count INTEGER DEFAULT 0,
  network_count INTEGER DEFAULT 0,
  
  last_fetched TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TRENDINGS
CREATE TABLE trendings (
  id SERIAL PRIMARY KEY,
  github_id BIGINT UNIQUE NOT NULL,
  full_name VARCHAR(500) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  owner_login VARCHAR(255),
  owner_avatar_url TEXT,
  description TEXT,
  html_url TEXT,
  homepage_url TEXT,
  
  stars_count INTEGER DEFAULT 0,
  forks_count INTEGER DEFAULT 0,
  watchers_count INTEGER DEFAULT 0,
  open_issues_count INTEGER DEFAULT 0,
  size_kb INTEGER DEFAULT 0,
  
  language VARCHAR(100),
  topics TEXT[],
  license_name VARCHAR(255),
  
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  pushed_at TIMESTAMPTZ,
  
  -- Status & Features (Restored)
  is_fork BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  is_disabled BOOLEAN DEFAULT FALSE,
  allow_forking BOOLEAN DEFAULT TRUE,
  is_template BOOLEAN DEFAULT FALSE,
  visibility VARCHAR(50) DEFAULT 'public',
  has_issues BOOLEAN DEFAULT TRUE,
  has_projects BOOLEAN DEFAULT TRUE,
  has_downloads BOOLEAN DEFAULT TRUE,
  has_wiki BOOLEAN DEFAULT TRUE,
  has_pages BOOLEAN DEFAULT FALSE,
  has_discussions BOOLEAN DEFAULT FALSE,
  
  default_branch VARCHAR(255),
  subscribers_count INTEGER DEFAULT 0,
  network_count INTEGER DEFAULT 0,
  
  last_fetched TIMESTAMPTZ DEFAULT NOW()
);

-- ================= METRICS TABLES (Linked by repo_github_id) =================

-- Repository Statistics
CREATE TABLE repository_stats (
  id SERIAL PRIMARY KEY,
  repo_github_id BIGINT UNIQUE NOT NULL,
  
  commits_last_month INTEGER DEFAULT 0,
  commits_last_year INTEGER DEFAULT 0,
  issues_closed_last_month INTEGER DEFAULT 0,
  pull_requests_merged_last_month INTEGER DEFAULT 0,
  stars_growth_30d INTEGER DEFAULT 0,
  forks_growth_30d INTEGER DEFAULT 0,
  contributors_count INTEGER DEFAULT 0,
  activity_score DECIMAL(10, 2) DEFAULT 0,
  health_score DECIMAL(5, 2) DEFAULT 0,
  avg_issue_close_time_days DECIMAL(10, 2),
  avg_pr_merge_time_days DECIMAL(10, 2),
  days_since_last_commit INTEGER,
  days_since_last_release INTEGER,
  latest_release_tag VARCHAR(255),
  latest_release_date TIMESTAMPTZ,
  total_releases INTEGER DEFAULT 0,
  contributors_data_type VARCHAR(50) DEFAULT 'all_time',
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Languages
CREATE TABLE repository_languages (
  id SERIAL PRIMARY KEY,
  repo_github_id BIGINT NOT NULL,
  language_name VARCHAR(100) NOT NULL,
  bytes_count INTEGER NOT NULL,
  percentage DECIMAL(5, 2) NOT NULL,
  UNIQUE(repo_github_id, language_name)
);

-- Contributors
CREATE TABLE repository_contributors (
  id SERIAL PRIMARY KEY,
  repo_github_id BIGINT NOT NULL,         -- The Repository
  contributor_github_id BIGINT NOT NULL,  -- The User
  
  login VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  html_url TEXT,
  contributions INTEGER DEFAULT 0,
  type VARCHAR(50),
  data_source VARCHAR(20),
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(repo_github_id, contributor_github_id)
);

-- Commit Activity
CREATE TABLE repository_commit_activity (
  id SERIAL PRIMARY KEY,
  repo_github_id BIGINT NOT NULL,
  week_timestamp BIGINT NOT NULL,
  week_date DATE NOT NULL,
  total_commits INTEGER DEFAULT 0,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(repo_github_id, week_timestamp)
);

-- Recent Commits
CREATE TABLE repository_commits (
  id SERIAL PRIMARY KEY,
  repo_github_id BIGINT NOT NULL,
  sha VARCHAR(40) NOT NULL,
  commit_message TEXT NOT NULL,
  author_name VARCHAR(255),
  author_email VARCHAR(255),
  author_login VARCHAR(255),
  author_avatar_url TEXT,
  committer_name VARCHAR(255),
  committer_date TIMESTAMPTZ NOT NULL,
  additions INTEGER DEFAULT 0,
  deletions INTEGER DEFAULT 0,
  total_changes INTEGER DEFAULT 0,
  files_changed INTEGER DEFAULT 0,
  html_url TEXT NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(repo_github_id, sha)
);

-- Indexes
CREATE INDEX idx_stats_repo_gid ON repository_stats(repo_github_id);
CREATE INDEX idx_contrib_repo_gid ON repository_contributors(repo_github_id);
CREATE INDEX idx_activity_repo_gid ON repository_commit_activity(repo_github_id);
CREATE INDEX idx_commits_repo_gid ON repository_commits(repo_github_id);
CREATE INDEX idx_langs_repo_gid ON repository_languages(repo_github_id);

-- Tops/Growings/Trendings Indexes
CREATE INDEX idx_tops_stars ON tops(stars_count DESC);
CREATE INDEX idx_growings_stars ON growings(stars_count DESC);
CREATE INDEX idx_trendings_stars ON trendings(stars_count DESC);