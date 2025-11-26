-- 1. Drop if exists to ensure clean state (CAREFUL: Deletes cached data)
DROP TABLE IF EXISTS repositories_index CASCADE;

-- 2. Create the Master Index (Exact Schema of 'tops' + sync_status)
CREATE TABLE repositories_index (
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
  
  -- Status & Features (The Missing Columns)
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
  
  -- Branch & Network
  default_branch VARCHAR(255),
  subscribers_count INTEGER DEFAULT 0,
  network_count INTEGER DEFAULT 0,
  
  -- Sync Logic
  last_fetched TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  sync_status VARCHAR(50) DEFAULT 'stub' -- 'stub' = Basic info, 'complete' = Full details
);

-- Indexes
CREATE INDEX idx_repo_index_fullname ON repositories_index(full_name);
CREATE INDEX IF NOT EXISTS idx_repo_index_status ON repositories_index(sync_status);