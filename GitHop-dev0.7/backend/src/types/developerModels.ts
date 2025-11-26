export interface DeveloperBadge {
  type: 'GDE' | 'MVP' | 'GitHub Star' | 'AWS Hero' | 'Big Tech Alumni' | 'Expert Vetted';
  category?: string;
  year?: number;
}

export interface DeveloperPersonas {
  ai_whisperer?: number;
  chain_architect?: number;
  cloud_native?: number;
  ux_engineer?: number;
  backend_behemoth?: number;
  systems_architect?: number;
  security_sentinel?: number;
  data_wrangler?: number;
  mobile_maestro?: number;
  game_guru?: number;
  iot_tinkerer?: number;
  ml_engineer?: number;
  data_scientist?: number;
  data_engineer?: number;
  devops_deamon?: number;
  frontend_wizard?: number;
  tooling_titan?: number;
  algorithm_alchemist?: number;
  qa_automator?: number;
  enterprise_architect?: number;
  computational_scientist?: number;
  [key: string]: number | undefined;
}

// New: Activity Intelligence Models
export interface RepoLink {
  name: string;
  owner: string;
  url: string;
  description?: string;
  language?: string;
  stars: number;
  // Metrics
  pulse_score?: number;   // For Current Work
  effort_score?: number;  // For Primary Work
  last_pushed_at?: string;
  // Internal Linking
  internal_repo_id?: number;
  internal_table?: 'tops' | 'trendings' | 'growings';
  is_contribution: boolean;
}

export interface CurrentWorkStatus {
  status: 'focused' | 'multi_tasking' | 'dormant';
  repos: RepoLink[]; // Can be 1 or 2 repos
}

export interface PrimaryWorkStatus {
  status: 'single_masterpiece' | 'dual_wielding' | 'prolific';
  repos: RepoLink[];
}

export interface Developer {
  id: number;
  github_id: number;
  login: string;
  name: string;
  avatar_url?: string;
  bio?: string;
  
  is_organization: boolean;
  
  followers_count: number;
  public_repos_count: number;
  total_stars_earned: number;
  years_active: number;
  dominant_language?: string;
  is_rising_star: boolean;
  
  badges: DeveloperBadge[];
  personas: DeveloperPersonas;
  
  // New Fields
  current_work?: CurrentWorkStatus;
  primary_work?: PrimaryWorkStatus;
  contributed_repos?: any[]; // Simplified for display
  
  company?: string;
  location?: string;
  blog_url?: string;
  twitter_username?: string;
  
  created_at: string;
  last_fetched: string;
}


// Add this to developerWorkerService.ts - New language analysis function

export interface LanguageExpertise {
  language: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert' | 'master';
  score: number;
  repos_count: number;
  total_stars: number;
  largest_project: string;
  largest_project_stars: number;
  total_commits?: number;
  is_primary: boolean;
}

export interface LanguageStats {
  expertise: LanguageExpertise[];
  favorites: string[]; // Top 3 most-used languages
  polyglot_score: number; // 0-100 based on language diversity
}

