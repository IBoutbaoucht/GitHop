-- =============================================================================
-- MODULE: DEVELOPER INTELLIGENCE
-- =============================================================================

-- 1. DEVELOPERS MASTER TABLE
CREATE TABLE developers (
  id SERIAL PRIMARY KEY,
  github_id BIGINT UNIQUE NOT NULL,
  login VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  avatar_url TEXT,
  bio TEXT,
  
  -- 📊 Basic Stats
  followers_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  public_repos_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ,
  
  -- 🏢 Entity Type
  is_organization BOOLEAN DEFAULT FALSE,
  
  -- 🌟 Impact & Insights
  total_stars_earned INTEGER DEFAULT 0,
  years_active INTEGER DEFAULT 0,
  
  -- 🧬 Tech Stack DNA
  dominant_language VARCHAR(100),
  
  -- 🏅 Prestige & Trust (JSON Storage)
  badges JSONB DEFAULT '[]',
  
  -- 🎭 Personas (18 Categories)
  personas JSONB DEFAULT '{}',
  
  -- 🤝 Contributions (Top 5 External)
  contributed_repos JSONB DEFAULT '[]',

  -- 🚧 Current Work (The repo they are pushing to NOW)
  -- Stores: { name, description, url, language, last_pushed_at, is_contribution: boolean }
  current_work JSONB DEFAULT '{}', 
  primary_work JSONB DEFAULT '{}',
  
  -- 📈 Discovery Flags
  is_rising_star BOOLEAN DEFAULT FALSE,
  scout_source VARCHAR(50) DEFAULT 'hall_of_fame',
  
  -- 🧠 Behavioral Stats
  consistency_streak INTEGER DEFAULT 0,
  work_schedule VARCHAR(50),
  good_citizen_score INTEGER DEFAULT 0,
  velocity_score DECIMAL(10, 2) DEFAULT 0,
  momentum_score DECIMAL(10, 2) DEFAULT 0,
  
  -- 🌍 Context
  company VARCHAR(255),
  location VARCHAR(255),
  blog_url TEXT,
  twitter_username VARCHAR(255),
  
  last_fetched TIMESTAMPTZ DEFAULT NOW()
);

-- 2. DEVELOPER TROPHY CASE (Top 3 Owned Repos)
CREATE TABLE developer_top_repos (
  id SERIAL PRIMARY KEY,
  developer_id INTEGER REFERENCES developers(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  html_url TEXT NOT NULL,
  description TEXT,
  stars_count INTEGER DEFAULT 0,
  language VARCHAR(100),
  
  -- 💎 Primary Work Flag 
  -- Now calculated based on MAX COMMITS (Effort), not just Stars
  is_primary BOOLEAN DEFAULT FALSE,
  
  UNIQUE(developer_id, name)
);

-- Indexes
CREATE INDEX idx_devs_impact ON developers(total_stars_earned DESC);
CREATE INDEX idx_devs_followers ON developers(followers_count DESC);
CREATE INDEX idx_devs_personas ON developers USING gin (personas);
CREATE INDEX idx_devs_is_org ON developers(is_organization);
CREATE INDEX idx_devs_source ON developers(scout_source);

CREATE INDEX idx_devs_current_work ON developers USING gin (current_work);
CREATE INDEX idx_devs_primary_work ON developers USING gin (primary_work);