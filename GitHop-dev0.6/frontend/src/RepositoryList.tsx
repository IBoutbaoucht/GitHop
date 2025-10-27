import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, GitFork, TrendingUp, Activity, ExternalLink, Award } from 'lucide-react';

/**
 * Interface representing a GitHub repository
 */
interface Repository {
  id: number;
  github_id: number;
  name: string;
  full_name: string;
  owner_login: string;
  owner_avatar_url?: string;
  description?: string;
  html_url: string;
  homepage_url?: string;
  stars_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  language?: string;
  topics?: string[];
  license_name?: string;
  created_at: string;
  pushed_at?: string;
  is_archived: boolean;
  is_fork: boolean;
  has_issues: boolean;
  has_wiki: boolean;
  has_pages: boolean;
  has_discussions: boolean;
  health_score?: number;
  activity_score?: number;
  days_since_last_commit?: number;
  commits_last_year?: number;
  latest_release_tag?: string;
  total_releases?: number;
}

/**
 * API base URL for backend requests
 */
const API_BASE = '/api';

/**
 * Color mapping for different programming languages
 * Used to display language-specific colors in the UI
 */
const languageColors: Record<string, string> = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Java: '#b07219',
  Go: '#00ADD8',
  Rust: '#dea584',
  'C++': '#f34b7d',
  C: '#555555',
  PHP: '#4F5D95',
  Ruby: '#701516',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
};

/**
 * Main component for displaying the repository list
 * Features:
 * - Displays trending GitHub repositories
 * - Shows repository statistics and metrics
 * - Allows navigation to repository details
 * - Maintains scroll position during navigation
 */
function RepositoryList() {
  const navigate = useNavigate();
  
  // State management
  const [repos, setRepos] = useState<Repository[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({ totalRepos: 0, totalStars: 0 });
  

  /**
   * Tracks scroll position in real-time and saves it to sessionStorage.
   * This is throttled to avoid performance issues from too many writes.
   */
  useEffect(() => {
    let throttleTimer: NodeJS.Timeout | null = null;
    const throttleDelay = 250; // Save scroll position max 4 times per second

    const handleScroll = () => {
      // If timer is active, skip this scroll event
      if (throttleTimer) return;

      throttleTimer = setTimeout(() => {
        sessionStorage.setItem('repos_scroll_position', window.scrollY.toString());
        throttleTimer = null; // Clear the timer
      }, throttleDelay);
    };

    window.addEventListener('scroll', handleScroll);
    
    // Cleanup
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (throttleTimer) {
        clearTimeout(throttleTimer); // Clear pending timer on unmount
      }
    };
  }, []); // Empty dependency array ensures this runs only on mount/unmount


  /**
   * Initializes component state
   * - Loads repositories from API
   * - Loads statistics
   */
  useEffect(() => {
    const initializeComponent = async () => {
      await loadRepositories();
      await loadStats();
    };

    initializeComponent();
  }, []);

  /**
   * Restores scroll position when navigating back to the page.
   * It runs after loading is complete to ensure the list is rendered.
   */
  useEffect(() => {
    // We only want to run this *after* loading is finished
    if (isLoading === false) {
      const savedPosition = sessionStorage.getItem('repos_scroll_position');
      
      if (savedPosition) {
        // Restore the scroll position after the list has rendered
        window.scrollTo(0, parseInt(savedPosition, 10));
      }
    }
  }, [isLoading]); // This effect depends on the loading state

  /**
   * Loads repositories from the backend API
   * Fetches a fixed set of trending repositories
   */
  const loadRepositories = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/repos/top?limit=300`);
      const { data } = await response.json();
      setRepos(data || []);
    } catch (error) {
      console.error('Error loading repositories:', error);
      setRepos([]);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Loads overall platform statistics
   * Includes total repositories and total stars across all repos
   */
  const loadStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/stats`);
      const data = await response.json();
      setStats({
        totalRepos: data.totalRepositories || 0,
        totalStars: data.totalStars || 0
      });
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  };

  /**
   * Handles repository card click
   * Navigates to repository details page
   * @param repo - The repository object that was clicked
   */
  const handleRepositoryClick = (repo: Repository) => {
    // Scroll position is now saved automatically by the scroll listener.
    navigate(`/repo/${repo.owner_login}/${repo.name}`);
  };

  /**
   * Handles home button click
   * Resets the application state and reloads fresh data
   */
  const handleHomeClick = () => {
    // Clear any stored state, including scroll position
    sessionStorage.removeItem('repos_scroll_position');
    
    // Reload the page to get fresh data
    window.location.href = '/';
  };

  /**
   * Formats large numbers with appropriate suffixes (K, M)
   * @param num - The number to format
   * @returns Formatted string representation of the number
   */
  const formatNumber = (num: number): string => {
    if (num >= 1_000_000) {
      return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (num >= 1_000) {
      return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return num?.toString() || '0';
  };

  /**
   * Determines activity level based on days since last commit
   * @param days - Number of days since last commit
   * @returns Object containing activity label and color class
   */
  const getActivityLevel = (days?: number): { label: string; color: string } => {
    if (!days) {
      return { label: 'Unknown', color: 'text-gray-400' };
    }
    if (days <= 7) {
      return { label: 'Very Active', color: 'text-green-400' };
    }
    if (days <= 30) {
      return { label: 'Active', color: 'text-blue-400' };
    }
    if (days <= 90) {
      return { label: 'Moderate', color: 'text-yellow-400' };
    }
    if (days <= 365) {
      return { label: 'Low Activity', color: 'text-orange-400' };
    }
    return { label: 'Inactive', color: 'text-red-400' };
  };

  /**
   * Renders the repository card component
   * @param repo - Repository data to display
   * @param index - Index in the list (used for ranking)
   * @returns JSX element for the repository card
   */
  const renderRepositoryCard = (repo: Repository, index: number) => {
    const rank = index + 1;
    const languageColor = languageColors[repo.language || ''] || '#6366f1';
    const activity = getActivityLevel(repo.days_since_last_commit);

    return (
      <div
        key={`${repo.owner_login}/${repo.name}`}
        onClick={() => handleRepositoryClick(repo)}
        className="group relative bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700/50 hover:border-purple-500/50 hover:bg-gray-800/70 transition-all duration-300 hover:scale-[1.02] cursor-pointer"
      >
        <div className="flex items-center gap-6">
          {/* Rank badge */}
          <div className="flex-shrink-0">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl flex items-center justify-center font-bold text-xl shadow-lg">
              #{rank}
            </div>
          </div>

          {/* Owner avatar */}
          {repo.owner_avatar_url && (
            <img
              src={repo.owner_avatar_url}
              alt={repo.owner_login}
              className="w-14 h-14 rounded-full border-2 border-purple-500/30"
            />
          )}

          {/* Repository information */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-xl font-bold text-purple-300 group-hover:text-purple-200 transition truncate">
                {repo.name}
              </h3>
              <span className="text-sm text-gray-400">by {repo.owner_login}</span>
              {repo.is_archived && (
                <span className="px-2 py-0.5 bg-orange-500/20 text-orange-300 text-xs rounded-full">
                  Archived
                </span>
              )}
            </div>
            
            <p className="text-gray-300 text-sm line-clamp-2 mb-3">
              {repo.description || 'No description available'}
            </p>
            
            {/* Repository topics */}
            {repo.topics && repo.topics.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {repo.topics.slice(0, 5).map((topic) => (
                  <span
                    key={topic}
                    className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-md"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Repository statistics */}
          <div className="flex-shrink-0 flex items-center gap-6">
            {/* Stars count */}
            <div className="text-center">
              <div className="flex items-center gap-2 text-yellow-300 font-bold text-lg">
                <Star className="w-5 h-5 fill-current" />
                {formatNumber(repo.stars_count)}
              </div>
              <div className="text-xs text-gray-400">stars</div>
            </div>

            {/* Forks count */}
            <div className="text-center">
              <div className="flex items-center gap-2 text-blue-300 font-semibold">
                <GitFork className="w-4 h-4" />
                {formatNumber(repo.forks_count)}
              </div>
              <div className="text-xs text-gray-400">forks</div>
            </div>

            {/* Programming language */}
            {repo.language && (
              <div className="text-center">
                <div className="flex items-center gap-2 text-sm">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: languageColor }}
                  />
                  <span className="text-gray-300">{repo.language}</span>
                </div>
              </div>
            )}

            {/* Activity level */}
            <div className="text-center">
              <Activity className={`w-5 h-5 mx-auto ${activity.color}`} />
              <div className={`text-xs ${activity.color}`}>{activity.label}</div>
            </div>
          </div>

          {/* External link indicator */}
          <ExternalLink className="w-5 h-5 text-gray-500 group-hover:text-purple-400 transition" />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white">
      {/* Application header */}
      <header className="sticky top-0 z-50 bg-gray-900/95 backdrop-blur-md border-b border-purple-500/20">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <TrendingUp className="w-8 h-8 text-purple-400" />
              <button onClick={handleHomeClick} className="cursor-pointer">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  GitHop
                </h1>
              </button>
            </div>
            
            {/* Platform statistics */}
            <div className="flex gap-6 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">
                  {formatNumber(stats.totalRepos)}
                </div>
                <div className="text-gray-400">Repositories</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-pink-400">
                  {formatNumber(stats.totalStars)}
                </div>
                <div className="text-gray-400">Total Stars</div>
              </div>
            </div>
          </div>
        </div>
      </header> {/* <-- This was the line I fixed */}

      {/* Main content area */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Loading state */}
        {isLoading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500"></div>
          </div>
        )}

        {/* Repository list */}
        {!isLoading && (
          <div className="space-y-4">
            {repos.map(renderRepositoryCard)}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && repos.length === 0 && (
          <div className="text-center py-16">
            <Award className="w-24 h-24 mx-auto text-gray-500 mb-6" />
            <h3 className="text-2xl font-bold text-gray-400 mb-2">No repositories found</h3>
            <p className="text-gray-500">Unable to load repository data at this time.</p>
          </div>
        )}

        {/* Results count */}
        {!isLoading && repos.length > 0 && (
          <div className="text-center py-8">
            <div className="text-gray-400 text-sm">
              Displaying {repos.length} repositories
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default RepositoryList;
