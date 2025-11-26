import { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Star, GitFork, TrendingUp, Activity, Award, Users, 
  Zap, Flame, ChevronRight, Code2, LayoutGrid, Search, X,
  Menu, ArrowDownUp, Filter, Briefcase
} from 'lucide-react';

// --- Interfaces ---

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
  updated_at?: string;
  is_archived: boolean;
  is_fork: boolean;
  has_issues: boolean;
  has_wiki: boolean;
  has_pages: boolean;
  has_discussions: boolean;
  
  // Metrics & Scores
  health_score?: number;
  activity_score?: number;
  days_since_last_commit?: number;
  commits_last_year?: number;
  latest_release_tag?: string;
  total_releases?: number;
}

const API_BASE = '/api';

const languageColors: Record<string, string> = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Java: '#b07219',
  Go: '#00ADD8', Rust: '#dea584', 'C++': '#f34b7d', C: '#555555', PHP: '#4F5D95',
  Ruby: '#701516', Swift: '#F05138', Kotlin: '#A97BFF',
};

// Updated Navigation Types to include 'expert-devs'
type NavigationView = 'top-repos' | 'growing-repos' | 'trending-repos' | 'top-devs' | 'expert-devs' | 'growing-devs';
type SortOption = 'stars' | 'forks' | 'updated';

// --- Global Cache ---
let topReposCache: Repository[] | null = null;
let growingReposCache: Repository[] | null = null;
let trendingReposCache: Repository[] | null = null;

function RepositoryList() {
  const navigate = useNavigate();
  
  // --- State Initialization ---
  
  const [currentView, setCurrentView] = useState<NavigationView>(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view') as NavigationView;
    const savedView = sessionStorage.getItem('active_view') as NavigationView;
    // Default to top-repos if valid, else fallback
    return ['top-repos', 'growing-repos', 'trending-repos'].includes(viewParam || '') 
      ? viewParam 
      : (savedView && ['top-repos', 'growing-repos', 'trending-repos'].includes(savedView) ? savedView : 'top-repos');
  });

  const [repos, setRepos] = useState<Repository[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({ totalRepos: 0, totalStars: 0 });

  // UI State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('stars');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [activeLanguage, setActiveLanguage] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // --- Helpers ---

  const getViewSource = (view: NavigationView) => {
    switch (view) {
      case 'growing-repos': return 'growings';
      case 'trending-repos': return 'trendings';
      default: return 'tops';
    }
  };

  const getSearchPlaceholder = () => {
    switch (currentView) {
      case 'growing-repos': return "Search new startups...";
      case 'trending-repos': return "Search viral repos...";
      default: return "Search top rated repositories...";
    }
  };

  // --- Scroll Persistence ---
  
  useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem(`scroll_pos_${currentView}`, window.scrollY.toString());
    };
    let throttleTimer: NodeJS.Timeout | null = null;
    const onScroll = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        handleScroll();
        throttleTimer = null;
      }, 100);
    };
    window.addEventListener('scroll', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (throttleTimer) clearTimeout(throttleTimer);
    };
  }, [currentView]);

  useLayoutEffect(() => {
    if (!isLoading && repos.length > 0) {
      const savedPosition = sessionStorage.getItem(`scroll_pos_${currentView}`);
      if (savedPosition) window.scrollTo(0, parseInt(savedPosition, 10));
      else window.scrollTo(0, 0);
    }
  }, [isLoading, currentView, repos]);

  // --- Data Fetching & Logic ---

  // 1. View Change Handler
  useEffect(() => {
    // If we are on a repo view, save it
    if (['top-repos', 'growing-repos', 'trending-repos'].includes(currentView)) {
      sessionStorage.setItem('active_view', currentView);
      
      const params = new URLSearchParams(window.location.search);
      if (params.get('view') !== currentView) {
        navigate(`?view=${currentView}`, { replace: true });
      }

      if (searchQuery || activeLanguage) return;

      const fetchData = async () => {
        setIsLoading(true);
        try {
          loadStats();
          const promises = [];
          if (!topReposCache) promises.push(fetchRepos('top-repos'));
          if (!growingReposCache) promises.push(fetchRepos('growing-repos'));
          if (!trendingReposCache) promises.push(fetchRepos('trending-repos'));

          await Promise.all(promises);
          updateReposList(currentView);
        } catch (error) {
          console.error("Initialization error:", error);
        } finally {
          setIsLoading(false);
        }
      };

      if (
        (currentView === 'top-repos' && topReposCache) ||
        (currentView === 'growing-repos' && growingReposCache) ||
        (currentView === 'trending-repos' && trendingReposCache)
      ) {
        updateReposList(currentView);
        setIsLoading(false);
        fetchData(); 
      } else {
        fetchData();
      }
    }
  }, [currentView]);

  // 2. Search & Sort Effect
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery || activeLanguage) {
        performSearch();
      } else if (searchQuery === "" && !activeLanguage && !isLoading) {
        if (!isSearching) {
            applyClientSort();
        } else {
            updateReposList(currentView);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, activeLanguage, currentView, sortBy]);

  const applyClientSort = () => {
      setRepos(prev => {
          const sorted = [...prev];
          return sortData(sorted);
      });
  };

  const sortData = (data: Repository[]) => {
      return data.sort((a, b) => {
          switch(sortBy) {
              case 'stars': return b.stars_count - a.stars_count;
              case 'forks': return b.forks_count - a.forks_count;
              case 'updated': 
                  return new Date(b.pushed_at || 0).getTime() - new Date(a.pushed_at || 0).getTime();
              default: return 0;
          }
      });
  };

  const performSearch = async () => {
    setIsSearching(true);
    try {
      let url = `${API_BASE}/repos/filter?q=${encodeURIComponent(searchQuery)}`;
      if (activeLanguage) url += `&language=${encodeURIComponent(activeLanguage)}`;
      
      const source = getViewSource(currentView);
      url += `&source=${encodeURIComponent(source)}`;
      
      if (sortBy === 'updated') url += `&sort_by=updated`; 
      
      const res = await fetch(url);
      const json = await res.json();
      setRepos(sortData(json.data || []));
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  const fetchRepos = async (type: NavigationView) => {
    let url = '';
    if (type === 'top-repos') url = `${API_BASE}/repos/top?limit=300`;
    if (type === 'growing-repos') url = `${API_BASE}/growings-database`;
    if (type === 'trending-repos') url = `${API_BASE}/trendings-database`;

    if (!url) return;

    try {
      const res = await fetch(url);
      const json = await res.json();
      const data = json.data || [];

      if (type === 'top-repos') topReposCache = data;
      if (type === 'growing-repos') growingReposCache = data;
      if (type === 'trending-repos') trendingReposCache = data;
    } catch (e) {
      console.error(`Failed to fetch ${type}`, e);
    }
  };

  const updateReposList = (view: NavigationView) => {
    let data: Repository[] = [];
    if (view === 'top-repos' && topReposCache) data = topReposCache;
    else if (view === 'growing-repos' && growingReposCache) data = growingReposCache;
    else if (view === 'trending-repos' && trendingReposCache) data = trendingReposCache;
    
    setRepos(sortData([...data]));
  };

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

  // --- Handlers ---

  const handleViewChange = (view: NavigationView) => {
    // --- FIX: Navigation Logic for Developers ---
    if (view === 'top-devs') {
        navigate('/developers?type=top');
        return;
    }
    if (view === 'expert-devs') {
        navigate('/developers?type=expert');
        return;
    }
    if (view === 'growing-devs') {
        navigate('/developers?type=rising');
        return;
    }

    // --- Normal Logic for Repositories ---
    if (view === currentView) {
        setIsMobileMenuOpen(false);
        return;
    }
    setSearchQuery("");
    setActiveLanguage(null);
    setCurrentView(view);
  };
  
  const handleClearSearch = () => {
    setSearchQuery("");
    setActiveLanguage(null);
  };

  const handleRepositoryClick = (repo: Repository) => {
    const source = getViewSource(currentView);
    navigate(`/repo/${repo.owner_login}/${repo.name}?source=${source}`);
  };

  const handleHomeClick = () => {

    if (currentView === 'top-repos') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setSearchQuery("");
      setActiveLanguage(null);
      setCurrentView('top-repos');
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num?.toString() || '0';
  };

  const getActivityLevel = (days?: number) => {
    if (days === undefined) return { label: 'Unknown', color: 'text-gray-400' };
    if (days <= 7) return { label: 'Very Active', color: 'text-green-400' };
    if (days <= 30) return { label: 'Active', color: 'text-blue-400' };
    if (days <= 90) return { label: 'Moderate', color: 'text-yellow-400' };
    if (days <= 365) return { label: 'Low Activity', color: 'text-orange-400' };
    return { label: 'Inactive', color: 'text-red-400' };
  };

  // --- Components ---

  const SidebarItem = ({ view, icon: Icon, label, isComingSoon = false }: any) => {
    const isActive = currentView === view;
    return (
      <button
        onClick={() => !isComingSoon && handleViewChange(view)}
        className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all duration-300 group relative overflow-hidden ${
          isActive
            ? 'bg-gradient-to-r from-purple-600/90 to-pink-600/90 text-white shadow-lg shadow-purple-500/20 border border-white/10'
            : 'text-gray-400 hover:bg-gray-800/50 hover:text-white border border-transparent hover:border-gray-700/50'
        } ${isComingSoon ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div className="flex items-center gap-3 z-10">
          <Icon className={`w-5 h-5 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110 text-gray-500 group-hover:text-purple-400'}`} />
          <span className={`font-medium tracking-wide ${isActive ? 'text-white' : ''}`}>{label}</span>
        </div>
        {isActive && <ChevronRight className="w-4 h-4 text-white/80" />}
      </button>
    );
  };

  const RepoSkeleton = () => (
    <div className="bg-gray-800/20 backdrop-blur-md rounded-2xl p-6 border border-white/5 animate-pulse">
      <div className="flex items-center gap-6">
        <div className="w-14 h-14 bg-gray-700/50 rounded-full"></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-5 bg-gray-700/50 rounded w-1/3"></div>
            <div className="h-4 bg-gray-800/50 rounded w-1/6"></div>
          </div>
          <div className="h-3 bg-gray-800/50 rounded w-3/4 mb-3"></div>
          <div className="flex gap-2">
            <div className="h-5 w-16 bg-gray-700/30 rounded"></div>
            <div className="h-5 w-16 bg-gray-700/30 rounded"></div>
          </div>
        </div>
        <div className="hidden sm:flex gap-4">
             <div className="w-16 h-10 bg-gray-800/50 rounded"></div>
             <div className="w-16 h-10 bg-gray-800/50 rounded"></div>
        </div>
      </div>
    </div>
  );

  const renderRepositoryCard = (repo: Repository, index: number) => {
    const rank = index + 1;
    const languageColor = languageColors[repo.language || ''] || '#6366f1';
    const activity = getActivityLevel(repo.days_since_last_commit);

    return (
      <div
        key={`${repo.full_name}-${repo.id}`}
        onClick={() => handleRepositoryClick(repo)}
        className="group relative bg-gray-800/40 backdrop-blur-md rounded-2xl p-6 border border-gray-700/30 hover:border-purple-500/40 hover:bg-gray-800/60 transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/10 cursor-pointer"
      >
        <div className="flex items-center gap-6">
          {!searchQuery && !activeLanguage && (
            <div className="flex-shrink-0 relative hidden sm:block">
              <div className="w-14 h-14 bg-gray-800 rounded-2xl flex items-center justify-center font-bold text-xl shadow-inner border border-gray-700 group-hover:border-purple-500/30 transition-colors">
                <span className="bg-gradient-to-br from-purple-400 to-pink-400 bg-clip-text text-transparent">#{rank}</span>
              </div>
            </div>
          )}

          {repo.owner_avatar_url && (
            <div className="relative">
              <img
                src={repo.owner_avatar_url}
                alt={repo.owner_login}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-gray-700 group-hover:border-purple-500/50 transition-colors"
              />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1">
              <h3 className="text-lg sm:text-xl font-bold text-gray-100 group-hover:text-purple-300 transition truncate tracking-tight">
                {repo.name}
              </h3>
              <span className="text-xs sm:text-sm text-gray-500 font-medium truncate">/ {repo.owner_login}</span>
              {repo.is_archived && (
                <span className="px-2 py-0.5 bg-orange-900/30 border border-orange-500/30 text-orange-300 text-[10px] uppercase font-bold rounded-full">
                  Archived
                </span>
              )}
            </div>
            
            <p className="text-gray-400 text-sm line-clamp-1 mb-3 font-medium">
              {repo.description || 'No description available'}
            </p>
            
            <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
              {repo.language && (
                <div className="flex items-center gap-1.5 bg-gray-800/50 px-2 py-1 rounded-md border border-gray-700/50">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: languageColor }} />
                  <span className="text-gray-300">{repo.language}</span>
                </div>
              )}
              
              {repo.topics?.slice(0, 3).map(t => (
                <span key={t} className="hidden sm:inline-block hover:text-purple-400 transition-colors">#{t}</span>
              ))}
            </div>
          </div>

          <div className="hidden md:flex flex-shrink-0 items-center gap-6 bg-gray-900/30 px-6 py-3 rounded-xl border border-gray-800 group-hover:border-gray-700/50 transition-colors">
            <div className="text-center">
              <div className="flex items-center gap-1.5 text-yellow-400 font-bold text-lg">
                <Star className="w-4 h-4 fill-current" />
                {formatNumber(repo.stars_count)}
              </div>
              <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">stars</div>
            </div>

            <div className="w-px h-8 bg-gray-800"></div>

            <div className="text-center">
              <div className="flex items-center gap-1.5 text-blue-400 font-bold text-lg">
                <GitFork className="w-4 h-4" />
                {formatNumber(repo.forks_count)}
              </div>
              <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">forks</div>
            </div>

            <div className="w-px h-8 bg-gray-800"></div>

            <div className="text-center min-w-[80px]">
              <div className={`font-bold text-sm ${activity.color} mb-0.5`}>{activity.label}</div>
              <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Activity</div>
            </div>
          </div>
        </div>
        
        <div className="md:hidden flex items-center justify-between mt-4 pt-4 border-t border-white/5">
             <div className="flex items-center gap-1.5 text-yellow-400 font-bold text-sm">
                <Star className="w-3.5 h-3.5 fill-current" /> {formatNumber(repo.stars_count)}
             </div>
             <div className="flex items-center gap-1.5 text-blue-400 font-bold text-sm">
                <GitFork className="w-3.5 h-3.5" /> {formatNumber(repo.forks_count)}
             </div>
             <div className={`font-bold text-xs ${activity.color}`}>{activity.label}</div>
        </div>
      </div>
    );
  };

  // --- Main Render ---

  return (
    <div className="min-h-screen bg-[#0B0C15] text-white selection:bg-purple-500/30">
      
      {/* Background Gradients */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-pink-600/10 rounded-full blur-[120px]"></div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0B0C15]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
               <button 
                 onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                 className="lg:hidden p-2 text-gray-400 hover:text-white bg-white/5 rounded-lg"
               >
                 {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
               </button>

              <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
                <Code2 className="w-6 h-6 text-white" />
              </div>
              <button onClick={handleHomeClick} className="cursor-pointer text-left">
                <h1 className="text-2xl font-bold tracking-tight text-white hidden sm:block">
                  Git<span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Hop</span>
                </h1>
              </button>
            </div>
            
            <div className="hidden sm:flex gap-8 bg-gray-900/50 px-6 py-2 rounded-full border border-white/5">
              <div className="flex flex-col items-center">
                <div className="text-sm font-bold text-white">{formatNumber(stats.totalRepos)}</div>
                <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Repos</div>
              </div>
              <div className="w-px h-8 bg-white/10"></div>
              <div className="flex flex-col items-center">
                <div className="text-sm font-bold text-white">{formatNumber(stats.totalStars)}</div>
                <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Stars</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex max-w-[1600px] mx-auto relative z-10">
        
        {/* Sidebar (Desktop) */}
        <aside className="hidden lg:block w-72 sticky top-24 h-[calc(100vh-6rem)] p-6">
          <div className="space-y-8">
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 px-4">Repositories</h3>
              <nav className="space-y-2">
                <SidebarItem view="top-repos" icon={Star} label="Top Rated" />
                <SidebarItem view="trending-repos" icon={Flame} label="Trending Now" />
                <SidebarItem view="growing-repos" icon={TrendingUp} label="Fast Growing" />
              </nav>
            </div>

            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 px-4">Developers</h3>
              <nav className="space-y-2">
                <SidebarItem view="top-devs" icon={Users} label="Top Developers" />
                <SidebarItem view="expert-devs" icon={Briefcase} label="Trending Experts" />
                <SidebarItem view="growing-devs" icon={Zap} label="Rising Stars" />
              </nav>
            </div>

            <div className="pt-6 border-t border-white/5 px-4">
              <div className="bg-gradient-to-br from-purple-900/20 to-pink-900/20 rounded-xl p-4 border border-white/5 text-center">
                <p className="text-xs text-gray-400 mb-3">Want to feature your repo?</p>
                <button className="text-xs font-bold bg-white text-black px-4 py-2 rounded-lg w-full hover:bg-gray-200 transition-colors">
                  Submit Repository
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-40 bg-[#0B0C15]/95 backdrop-blur-xl pt-24 px-6 animate-in slide-in-from-left-10 duration-200">
             <div className="space-y-8">
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Repositories</h3>
                  <div className="space-y-2">
                    <SidebarItem view="top-repos" icon={Star} label="Top Rated" />
                    <SidebarItem view="trending-repos" icon={Flame} label="Trending Now" />
                    <SidebarItem view="growing-repos" icon={TrendingUp} label="Fast Growing" />
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Developers</h3>
                  <div className="space-y-2">
                    <SidebarItem view="top-devs" icon={Users} label="Top Developers" />
                    <SidebarItem view="expert-devs" icon={Briefcase} label="Trending Experts" />
                    <SidebarItem view="growing-devs" icon={Zap} label="Rising Stars" />
                  </div>
                </div>
             </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 px-4 sm:px-6 py-8 min-w-0">
          
          {/* --- SEARCH & FILTER BAR --- */}
          <div className="mb-6 space-y-4 sticky top-24 z-30 bg-[#0B0C15]/80 backdrop-blur-xl py-2 -mx-2 px-2 rounded-2xl border border-white/5 shadow-2xl">
            {/* Input Group */}
            <div className="flex gap-2">
              <div className="relative group flex-1 shadow-lg shadow-purple-500/5 rounded-xl">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-500 group-focus-within:text-purple-400 transition-colors" />
                </div>
                <input
                  type="text"
                  className="block w-full pl-11 pr-4 py-3 bg-gray-900/80 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all"
                  placeholder={getSearchPlaceholder()}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery("")}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
              
              <div className="relative group">
                 <select 
                   value={sortBy}
                   onChange={(e) => setSortBy(e.target.value as SortOption)}
                   className="appearance-none h-full bg-gray-900/80 border border-white/10 text-white pl-4 pr-10 rounded-xl focus:ring-2 focus:ring-purple-500/50 cursor-pointer text-sm font-bold"
                 >
                   <option value="stars">Most Stars</option>
                   <option value="forks">Most Forks</option>
                   <option value="updated">Last Updated</option>
                 </select>
                 <ArrowDownUp className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 mr-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                <Filter className="w-3 h-3" /> Filter:
              </div>
              {['TypeScript', 'Python', 'Rust', 'Go', 'JavaScript','C','C++','Java'].map(lang => (
                <button
                  key={lang}
                  onClick={() => setActiveLanguage(activeLanguage === lang ? null : lang)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all whitespace-nowrap ${
                    activeLanguage === lang
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/50'
                      : 'bg-white/5 text-gray-400 border-white/5 hover:border-white/20 hover:text-white'
                  }`}
                >
                  {lang}
                </button>
              ))}
              
              {(activeLanguage || searchQuery) && (
                <button 
                  onClick={handleClearSearch}
                  className="px-3 py-1 rounded-lg text-xs font-bold text-red-400 hover:bg-red-400/10 transition-colors flex items-center gap-1 ml-auto"
                >
                  <X className="w-3 h-3" /> Clear Filters
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-3">
              <LayoutGrid className="w-6 h-6 text-purple-400" />
              {searchQuery || activeLanguage ? 'Results' : (
                <>
                  {currentView === 'top-repos' && 'Most Starred Repositories'}
                  {currentView === 'trending-repos' && 'Trending This Week'}
                  {currentView === 'growing-repos' && 'Fastest Growing Repos'}
                </>
              )}
            </h2>
            
            <div className="text-xs sm:text-sm text-gray-500 font-medium bg-gray-900/50 px-3 py-1.5 rounded-lg border border-white/5">
              {isLoading ? 'Loading...' : `${repos.length} repos`}
            </div>
          </div>

          {isLoading || isSearching ? (
            <div className="space-y-4">
              <RepoSkeleton />
              <RepoSkeleton />
              <RepoSkeleton />
              <RepoSkeleton />
              <RepoSkeleton />
            </div>
          ) : repos.length > 0 ? (
            <div className="space-y-4 pb-12 animate-in fade-in duration-500">
              {repos.map((repo, index) => renderRepositoryCard(repo, index))}
            </div>
          ) : (
            <div className="text-center py-32 bg-gray-900/20 rounded-3xl border border-white/5 border-dashed">
              <Award className="w-16 h-16 mx-auto text-gray-600 mb-4 opacity-50" />
              <h3 className="text-xl font-bold text-gray-400 mb-2">No repositories found</h3>
              <p className="text-gray-600">Try adjusting your search or filters.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default RepositoryList;