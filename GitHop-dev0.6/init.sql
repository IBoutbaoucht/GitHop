-- GitHop Enhanced Database Schema
DROP TABLE IF EXISTS repository_languages CASCADE;
DROP TABLE IF EXISTS repository_stats CASCADE;
DROP TABLE IF EXISTS repositories CASCADE;

-- Main repositories table
CREATE TABLE repositories (
  id SERIAL PRIMARY KEY,
  github_id BIGINT UNIQUE NOT NULL,
  
  -- Basic Information
  name VARCHAR(255) NOT NULL,
  full_name VARCHAR(500) UNIQUE NOT NULL,
  owner_login VARCHAR(255) NOT NULL,
  owner_avatar_url TEXT,
  owner_type VARCHAR(50),
  description TEXT,
  html_url TEXT NOT NULL,
  homepage_url TEXT,
  
  -- Engagement Metrics
  stars_count INTEGER NOT NULL DEFAULT 0,
  forks_count INTEGER DEFAULT 0,
  watchers_count INTEGER DEFAULT 0,
  open_issues_count INTEGER DEFAULT 0,
  
  -- Size & Content
  size_kb INTEGER DEFAULT 0,
  
  -- Language & Topics
  language VARCHAR(100),
  topics TEXT[],
  
  -- License
  license_name VARCHAR(255),
  license_key VARCHAR(100),
  
  -- Timestamps
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  pushed_at TIMESTAMPTZ,
  
  -- Status
  is_fork BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  is_disabled BOOLEAN DEFAULT FALSE,
  allow_forking BOOLEAN DEFAULT TRUE,
  is_template BOOLEAN DEFAULT FALSE,
  
  -- Features
  visibility VARCHAR(50) DEFAULT 'public',
  has_issues BOOLEAN DEFAULT TRUE,
  has_projects BOOLEAN DEFAULT TRUE,
  has_downloads BOOLEAN DEFAULT TRUE,
  has_wiki BOOLEAN DEFAULT TRUE,
  has_pages BOOLEAN DEFAULT FALSE,
  has_discussions BOOLEAN DEFAULT FALSE,
  
  -- Branch
  default_branch VARCHAR(255) DEFAULT 'main',
  
  -- Community
  subscribers_count INTEGER DEFAULT 0,
  network_count INTEGER DEFAULT 0,
  
  -- Metadata
  last_fetched TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT positive_stars CHECK (stars_count >= 0),
  CONSTRAINT positive_forks CHECK (forks_count >= 0)
);

-- Repository statistics
CREATE TABLE repository_stats (
  id SERIAL PRIMARY KEY,
  repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  
  -- Activity
  commits_last_month INTEGER DEFAULT 0,
  commits_last_year INTEGER DEFAULT 0,
  issues_closed_last_month INTEGER DEFAULT 0,
  pull_requests_merged_last_month INTEGER DEFAULT 0,
  
  -- Growth
  stars_growth_30d INTEGER DEFAULT 0,
  forks_growth_30d INTEGER DEFAULT 0,
  contributors_count INTEGER DEFAULT 0,
  
  -- Scores
  activity_score DECIMAL(10, 2) DEFAULT 0,
  health_score DECIMAL(5, 2) DEFAULT 0,
  
  -- Time Metrics
  avg_issue_close_time_days DECIMAL(10, 2),
  avg_pr_merge_time_days DECIMAL(10, 2),
  days_since_last_commit INTEGER,
  days_since_last_release INTEGER,
  
  -- Releases
  latest_release_tag VARCHAR(255),
  latest_release_date TIMESTAMPTZ,
  total_releases INTEGER DEFAULT 0,
  
  -- *** NEW COLUMN ***
  -- Tracks if contributor data is all-time or just recent (for large repos)
  contributors_data_type VARCHAR(50) DEFAULT 'all_time',

  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(repository_id)
);

-- Language breakdown
CREATE TABLE repository_languages (
  id SERIAL PRIMARY KEY,
  repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  language_name VARCHAR(100) NOT NULL,
  bytes_count INTEGER NOT NULL,
  percentage DECIMAL(5, 2) NOT NULL,
  
  UNIQUE(repository_id, language_name)
);


-- Add after repository_languages table

-- Contributors table
CREATE TABLE repository_contributors (
  id SERIAL PRIMARY KEY,
  repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  github_id BIGINT NOT NULL,
  login VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  html_url TEXT,
  contributions INTEGER DEFAULT 0,
  type VARCHAR(50), -- User or Bot
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(repository_id, github_id)
);

-- Commit activity table (weekly aggregated data)
CREATE TABLE repository_commit_activity (
  id SERIAL PRIMARY KEY,
  repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  week_timestamp BIGINT NOT NULL, -- Unix timestamp
  week_date DATE NOT NULL,
  total_commits INTEGER DEFAULT 0,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(repository_id, week_timestamp)
);

-- Create indexes for performance
CREATE INDEX idx_contributors_repo_id ON repository_contributors(repository_id);
CREATE INDEX idx_contributors_contributions ON repository_contributors(contributions DESC);
CREATE INDEX idx_commit_activity_repo_id ON repository_commit_activity(repository_id);
CREATE INDEX idx_commit_activity_week ON repository_commit_activity(week_date DESC);

-- Jobs tracking table (to prevent duplicate workers)
CREATE TABLE background_jobs (
  id SERIAL PRIMARY KEY,
  job_type VARCHAR(100) NOT NULL,
  repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'pending', -- pending, running, completed, failed
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jobs_status ON background_jobs(status);
CREATE INDEX idx_jobs_type ON background_jobs(job_type);
CREATE INDEX idx_jobs_repo ON background_jobs(repository_id);
-- Performance indexes
CREATE INDEX idx_repos_stars_id ON repositories(stars_count DESC, id DESC);
CREATE INDEX idx_repos_github_id ON repositories(github_id);
CREATE INDEX idx_repos_full_name ON repositories(full_name);
CREATE INDEX idx_repos_owner ON repositories(owner_login);
CREATE INDEX idx_repos_pushed_at ON repositories(pushed_at DESC);
CREATE INDEX idx_repos_created_at ON repositories(created_at DESC);
CREATE INDEX idx_repos_language ON repositories(language);
CREATE INDEX idx_repos_archived ON repositories(is_archived);
CREATE INDEX idx_repos_fork ON repositories(is_fork);
CREATE INDEX idx_repos_name_search ON repositories USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));
CREATE INDEX idx_stats_repo_id ON repository_stats(repository_id);
CREATE INDEX idx_stats_activity_score ON repository_stats(activity_score DESC);
CREATE INDEX idx_stats_health_score ON repository_stats(health_score DESC);
CREATE INDEX idx_langs_repo_id ON repository_languages(repository_id);

-- Enriched view
CREATE VIEW repositories_enriched AS
SELECT 
  r.*,
  rs.commits_last_month,
  rs.commits_last_year,
  rs.activity_score,
  rs.health_score,
  rs.stars_growth_30d,
  rs.contributors_count,
  rs.days_since_last_commit,
  rs.latest_release_tag,
  rs.latest_release_date,
  rs.total_releases,
  rs.contributors_data_type -- *** ADDED TO VIEW ***
FROM repositories r
LEFT JOIN repository_stats rs ON r.id = rs.repository_id;

DO $$
BEGIN
  RAISE NOTICE '✅ Enhanced database schema created successfully!';
END $$;
