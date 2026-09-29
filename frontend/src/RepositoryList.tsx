import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE } from './config';
import {
  Star, GitFork, TrendingUp, Activity, Award, Users,
  Zap, Flame, ChevronRight, Code2, LayoutGrid, Search, X,
  Menu, ArrowDownUp, Filter, Briefcase, RotateCcw, Sparkles,
  Calendar, Clock, History, AlertCircle, ArrowUp
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
  health_score?: number;
  activity_score?: number;
  days_since_last_commit?: number;
  similarity?: number;
}


const languageColors: Record<string, string> = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Java: '#b07219',
  Go: '#00ADD8', Rust: '#dea584', 'C++': '#f34b7d', C: '#555555', PHP: '#4F5D95',
  Ruby: '#701516', Swift: '#F05138', Kotlin: '#A97BFF',
};

type NavigationView = 'top-repos' | 'growing-repos' | 'trending-repos' | 'smart-search' | 'top-devs' | 'expert-devs' | 'growing-devs' | 'badge-devs'
  | 'trend-7d' | 'trend-30d' | 'trend-90d';
type SortOption = 'stars' | 'forks' | 'updated';

function RepositoryList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const observerTarget = useRef<HTMLDivElement>(null);

  // --- 1. STATE DERIVATION ---
  const currentView = (searchParams.get('view') as NavigationView) || 'top-repos';
  const urlQuery = searchParams.get('q') || '';
  const activeLanguage = searchParams.get('language');
  const sortBy = (searchParams.get('sort') as SortOption) || 'stars';
  const smartQueryParam = searchParams.get('smart_q') || '';

  // --- 2. UI STATE ---
  const [localSearch, setLocalSearch] = useState(currentView === 'smart-search' ? smartQueryParam : urlQuery);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [cursor, setCursor] = useState<{ lastStars: number; lastId: number } | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [stats, setStats] = useState({ totalRepos: 0, totalStars: 0 });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const hasRestoredScroll = useRef(false);

  // --- 3. INPUT SYNC LOGIC ---
  useEffect(() => {
    setLocalSearch(currentView === 'smart-search' ? smartQueryParam : urlQuery);
  }, [urlQuery, smartQueryParam, currentView]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const targetParam = currentView === 'smart-search' ? 'smart_q' : 'q';
      const currentParamValue = currentView === 'smart-search' ? smartQueryParam : urlQuery;

      // Edge Case: Prevent overwriting state if user is typing
      if (localSearch !== currentParamValue) {
        setSearchParams(prev => {
          const next = new URLSearchParams(prev);
          if (localSearch) next.set(targetParam, localSearch);
          else next.delete(targetParam);
          return next;
        }, { replace: true });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [localSearch, currentView]);

  // --- 4. DATA LOGIC ---
  const getViewSource = (view: string) => {
    switch (view) {
      case 'growing-repos': return 'growings';
      case 'trending-repos': return 'trendings';
      case 'trend-7d': return 'trending_weekly';
      case 'trend-30d': return 'trending_monthly';
      case 'trend-90d': return 'trending_quarterly';
      default: return 'tops';
    }
  };

  const getFetchUrl = (isLoadMore = false) => {
    if (currentView === 'smart-search') {
      if (!smartQueryParam) return null;
      return `${API_BASE}/search/smart?q=${encodeURIComponent(smartQueryParam)}`;
    }
    const isNewTrendView = ['trend-7d', 'trend-30d', 'trend-90d'].includes(currentView);
    if (urlQuery || activeLanguage || sortBy === 'updated' || isNewTrendView) {
      let url = `${API_BASE}/repos/filter?q=${encodeURIComponent(urlQuery)}`;
      if (activeLanguage) url += `&language=${encodeURIComponent(activeLanguage)}`;
      const source = getViewSource(currentView);
      url += `&source=${encodeURIComponent(source)}`;
      if (sortBy === 'updated') url += `&sort_by=updated`;
      else if (sortBy === 'forks') url += `&sort_by=forks`;
      return url;
    }
    if (currentView === 'growing-repos') return `${API_BASE}/growings-database`;
    if (currentView === 'trending-repos') return `${API_BASE}/trendings-database`;
    let url = `${API_BASE}/repos/top?limit=30`;
    if (isLoadMore && cursor) {
      url += `&lastStars=${cursor.lastStars}&lastId=${cursor.lastId}`;
    }
    return url;
  };

  // --- 5. EFFECTS ---
  useEffect(() => {
    const controller = new AbortController();

    const fetchData = async () => {
      if (currentView === 'smart-search' && !smartQueryParam) {
        setRepos([]);
        setIsLoading(false);
        setIsValidating(false);
        return;
      }
      if (repos.length > 0) setIsValidating(true);
      else setIsLoading(true);

      setCursor(null);
      const isNewTrendView = ['trend-7d', 'trend-30d', 'trend-90d'].includes(currentView);
      setHasMore(currentView !== 'smart-search' && !urlQuery && !activeLanguage && !isNewTrendView);
      hasRestoredScroll.current = false;

      try {
        const url = getFetchUrl(false);
        if (!url) return;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error('Network error');

        const json = await res.json();
        setRepos(json.data || []);
        if (json.nextCursor && currentView === 'top-repos') {
          setCursor(json.nextCursor);
          setHasMore(json.hasMore);
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') console.error(e);
      } finally {
        if (!controller.signal.aborted) {
            setIsLoading(false); setIsValidating(false);
        }
      }
    };
    fetchData();
    fetchStats();

    return () => controller.abort();
  }, [currentView, urlQuery, activeLanguage, sortBy, smartQueryParam]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/stats`);
      const data = await res.json();
      setStats({ totalRepos: data.totalRepositories || 0, totalStars: data.totalStars || 0 });
    } catch (e) {}
  };

  const loadMore = useCallback(async () => {
    if (!hasMore || isFetchingMore || isLoading || isValidating) return;
    const isNewTrendView = ['trend-7d', 'trend-30d', 'trend-90d'].includes(currentView);
    if (currentView === 'smart-search' || urlQuery || activeLanguage || isNewTrendView) return;
    setIsFetchingMore(true);
    try {
      const url = getFetchUrl(true);
      if (!url) return;
      const res = await fetch(url);
      const json = await res.json();
      if (json.data && json.data.length > 0) {
        setRepos(prev => [...prev, ...json.data]);
        setCursor(json.nextCursor || null);
        setHasMore(json.hasMore);
      } else { setHasMore(false); }
    } catch (e) { console.error(e); } finally { setIsFetchingMore(false); }
  }, [hasMore, isFetchingMore, isLoading, isValidating, cursor, currentView, urlQuery, activeLanguage]);

  useEffect(() => {
    const observer = new IntersectionObserver(entries => { if (entries[0].isIntersecting) loadMore(); }, { threshold: 0.1, rootMargin: '100px' });
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => { if (observerTarget.current) observer.unobserve(observerTarget.current); };
  }, [loadMore]);

  // --- Scroll Restoration & Back to Top ---
  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'manual';
    }
    const key = `scroll_pos_${currentView}_${activeLanguage || 'all'}_${urlQuery || 'none'}_${smartQueryParam || 'none'}`;
    if (!isLoading && repos.length > 0 && !hasRestoredScroll.current) {
      const saved = sessionStorage.getItem(key);
      if (saved) requestAnimationFrame(() => window.scrollTo(0, parseInt(saved, 10)));
      hasRestoredScroll.current = true;
    }
    const handleScroll = () => {
        if (!isLoading) sessionStorage.setItem(key, window.scrollY.toString());
        setShowBackToTop(window.scrollY > 500);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLoading, currentView, activeLanguage, urlQuery, smartQueryParam, repos.length]);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  // --- 7. HANDLERS ---
  const handleViewChange = (view: NavigationView) => {
    setIsMobileMenuOpen(false);
    if (['top-devs', 'growing-devs', 'expert-devs', 'badge-devs'].includes(view)) {
      let type = 'top';
      if (view === 'growing-devs') type = 'rising';
      if (view === 'expert-devs') type = 'expert';
      if (view === 'badge-devs') type = 'badge';
      navigate(`/developers?type=${type}`);
      return;
    }
    navigate(`/?view=${view}`);
  };

  const updateFilter = (key: string, value: string | null) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  };

  const handleRepositoryClick = (repo: Repository) => {
    // Edge Case: Fallback if owner_login missing
    if (!repo.owner_login || !repo.name) return;
    const source = currentView === 'smart-search' ? 'tops' : getViewSource(currentView);
    navigate(`/repo/${repo.owner_login}/${repo.name}?source=${source}`);
  };

  const SidebarItem = ({ view, icon: Icon, label }: any) => {
    const isActive = currentView === view;
    // Visually mute links that belong to the "Other" page (Developers)
    const isExternalContext = ['top-devs', 'growing-devs', 'expert-devs', 'badge-devs'].includes(view);

    return (
      <button
        onClick={() => handleViewChange(view)}
        className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all duration-300 group relative overflow-hidden ${
          isActive
            ? 'bg-gradient-to-r from-purple-600/90 to-pink-600/90 text-white shadow-lg shadow-purple-500/20 border border-white/10'
            : 'text-gray-400 hover:bg-white/5 hover:text-white border border-transparent hover:border-white/5'
        } cursor-pointer`}
      >
        <div className="flex items-center gap-3 z-10">
          <Icon className={`w-5 h-5 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'} ${isActive ? 'text-white' : isExternalContext ? 'text-gray-600 group-hover:text-purple-400' : 'text-gray-500 group-hover:text-purple-400'}`} />
          <span className={`font-medium tracking-wide ${isActive ? 'text-white' : ''}`}>{label}</span>
        </div>
        {isActive && <ChevronRight className="w-4 h-4 text-white/80" />}
      </button>
    );
  };

  const formatNumber = (num: number) => {
    if (isNaN(num)) return "0";
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num?.toString() || '0';
  };

  const renderRepositoryCard = (repo: Repository, index: number) => {
    const rank = index + 1;
    const languageColor = languageColors[repo.language || ''] || '#6366f1';
    const activity = repo.days_since_last_commit === undefined ? { label: 'Unknown', color: 'text-gray-400' } :
                     repo.days_since_last_commit <= 7 ? { label: 'Very Active', color: 'text-green-400' } :
                     repo.days_since_last_commit <= 30 ? { label: 'Active', color: 'text-blue-400' } :
                     repo.days_since_last_commit <= 90 ? { label: 'Moderate', color: 'text-yellow-400' } :
                     { label: 'Inactive', color: 'text-red-400' };
    const isSmartResult = currentView === 'smart-search';

    return (
      <div
        key={`${repo.full_name}-${repo.id}`}
        onClick={() => handleRepositoryClick(repo)}
        className="group relative bg-[#13141F]/80 backdrop-blur-sm rounded-2xl p-6 border border-white/5 hover:border-purple-500/30 hover:bg-[#1A1B26] transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/5 cursor-pointer hover:-translate-y-1"
      >
        <div className="flex items-center gap-6">
          {isSmartResult && repo.similarity ? (
             <div className="flex-shrink-0 relative hidden sm:block">
              <div className="w-14 h-14 bg-gray-900/50 rounded-2xl flex flex-col items-center justify-center font-bold text-xs border border-green-500/20">
                <span className="text-sm text-green-400">{Math.round(repo.similarity * 100)}%</span>
                <span className="text-[9px] text-gray-500 uppercase tracking-tight">Match</span>
              </div>
            </div>
          ) : !urlQuery && !activeLanguage && (
            <div className="flex-shrink-0 relative hidden sm:block">
              <div className="w-14 h-14 bg-gray-900/50 rounded-2xl flex items-center justify-center font-bold text-xl border border-white/5 group-hover:border-purple-500/20 transition-colors">
                <span className="text-gray-500 group-hover:text-purple-400 transition-colors">#{rank}</span>
              </div>
            </div>
          )}

          {repo.owner_avatar_url && (
            <div className="relative">
              <img src={repo.owner_avatar_url} alt={repo.owner_login} className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl border border-white/5 group-hover:border-purple-500/30 transition-colors shadow-lg" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1">
              <h3 className="text-lg sm:text-xl font-bold text-white group-hover:text-purple-300 transition truncate tracking-tight">{repo.name}</h3>
              <span className="text-xs sm:text-sm text-gray-500 font-medium truncate">/ {repo.owner_login}</span>
              {repo.is_archived && <span className="px-2 py-0.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] uppercase font-bold rounded-full">Archived</span>}
            </div>
            <p className="text-gray-400 text-sm line-clamp-1 mb-3 font-medium leading-relaxed">{repo.description || 'No description available'}</p>
            <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
              {repo.language && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/5">
                  <span className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ color: languageColor, backgroundColor: languageColor }} />
                  <span className="text-gray-300">{repo.language}</span>
                </div>
              )}
              {repo.topics?.slice(0, 3).map(t => <span key={t} className="hidden sm:inline-block hover:text-purple-400 transition-colors">#{t}</span>)}
            </div>
          </div>

          <div className="hidden md:flex flex-shrink-0 items-center gap-6 bg-black/20 px-6 py-3 rounded-xl border border-white/5 group-hover:border-white/10 transition-colors">
            <div className="text-center min-w-[60px]">
              <div className="flex justify-center items-center gap-1.5 text-yellow-400 font-bold text-lg"><Star className="w-4 h-4 fill-current" />{formatNumber(repo.stars_count)}</div>
              <div className="text-[10px] uppercase font-bold text-gray-600 tracking-wider">stars</div>
            </div>
            <div className="w-px h-8 bg-white/5"></div>
            <div className="text-center min-w-[60px]">
              <div className="flex justify-center items-center gap-1.5 text-blue-400 font-bold text-lg"><GitFork className="w-4 h-4" />{formatNumber(repo.forks_count)}</div>
              <div className="text-[10px] uppercase font-bold text-gray-600 tracking-wider">forks</div>
            </div>
            <div className="w-px h-8 bg-white/5"></div>
            <div className="text-center min-w-[80px]">
              <div className={`font-bold text-sm ${activity.color} mb-0.5`}>{activity.label}</div>
              <div className="text-[10px] uppercase font-bold text-gray-600 tracking-wider">Activity</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0B0C15] text-white selection:bg-purple-500/30 font-sans">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[120px] opacity-50"></div>
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] opacity-50"></div>
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03]"></div>
      </div>

      <header className="sticky top-0 z-50 bg-[#0B0C15]/80 backdrop-blur-xl border-b border-white/5 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="lg:hidden p-2 text-gray-400 hover:text-white bg-white/5 rounded-lg active:scale-95 transition-transform">
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
              <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20 ring-1 ring-white/10">
                <Code2 className="w-6 h-6 text-white" />
              </div>
              <button onClick={() => navigate('/')} className="cursor-pointer text-left group">
                <h1 className="text-2xl font-bold tracking-tight text-white hidden sm:block">Git<span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 group-hover:brightness-110 transition-all">Hop</span></h1>
              </button>
            </div>
            <div className="hidden sm:flex gap-8 bg-black/20 px-6 py-2 rounded-full border border-white/5 backdrop-blur-sm">
              <div className="flex flex-col items-center">
                <div className="text-sm font-bold text-white tabular-nums">{formatNumber(stats.totalRepos)}</div>
                <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Repos</div>
              </div>
              <div className="w-px h-8 bg-white/10"></div>
              <div className="flex flex-col items-center">
                <div className="text-sm font-bold text-white tabular-nums">{formatNumber(stats.totalStars)}</div>
                <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Stars</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex max-w-[1600px] mx-auto relative z-10">
        <aside className="hidden lg:block w-72 sticky top-24 h-[calc(100vh-6rem)] p-6 overflow-y-auto scrollbar-hide">
          <div className="space-y-8">
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 px-4 flex items-center gap-2">
                 <History className="w-3 h-3" /> Time Travel
              </h3>
              <nav className="space-y-2">
                <SidebarItem view="trend-7d" icon={Clock} label="Past 7 Days" />
                <SidebarItem view="trend-30d" icon={Calendar} label="Past 30 Days" />
                <SidebarItem view="trend-90d" icon={Activity} label="Past 90 Days" />
              </nav>
            </div>

            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 px-4">Repositories</h3>
              <nav className="space-y-2">
                <SidebarItem view="top-repos" icon={Star} label="Top Rated" />
                <SidebarItem view="trending-repos" icon={Flame} label="Active Coding" />
                <SidebarItem view="growing-repos" icon={TrendingUp} label="New Arrivals" />
                <SidebarItem view="smart-search" icon={Sparkles} label="Intelligent Search" />
              </nav>
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 px-4">Developers</h3>
              <div className="space-y-2">
                <SidebarItem view="top-devs" icon={Users} label="Hall of Fame" />
                <SidebarItem view="badge-devs" icon={Award} label="Badge Holders" />
                <SidebarItem view="expert-devs" icon={Briefcase} label="Trending Experts" />
                <SidebarItem view="growing-devs" icon={Zap} label="Rising Stars" />
              </div>
            </div>
            {/* Removed "Submit Repository" Section as requested */}
          </div>
        </aside>

        {isMobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-40 bg-[#0B0C15]/95 backdrop-blur-2xl pt-24 px-6 animate-in slide-in-from-left-5 duration-300">
            <div className="space-y-8">
               <SidebarItem view="top-repos" icon={Star} label="Top Rated Repos" />
               <SidebarItem view="smart-search" icon={Sparkles} label="AI Search" />
               <SidebarItem view="top-devs" icon={Users} label="Developers" />
            </div>
          </div>
        )}

        <main className="flex-1 px-4 sm:px-6 py-8 min-w-0">
          <div className="mb-6 space-y-4 sticky top-24 z-30 bg-[#0B0C15]/80 backdrop-blur-xl py-2 -mx-2 px-2 rounded-2xl border border-white/5 shadow-2xl">
            <div className="flex gap-3">
              <div className="relative group flex-1 shadow-lg shadow-purple-500/5 rounded-xl transition-all focus-within:shadow-purple-500/10">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-500 group-focus-within:text-purple-400 transition-colors" />
                </div>
                <input
                  type="text"
                  className="block w-full pl-11 pr-10 py-3.5 bg-[#13141F] border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all"
                  placeholder={currentView === 'smart-search' ? "Ask AI (e.g. 'Go chat app with websockets')..." : "Search repositories..."}
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                />
                {localSearch && (
                  <button onClick={() => setLocalSearch('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-white transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {currentView !== 'smart-search' && (
                <div className="relative group min-w-[140px] hidden sm:block">
                  <select
                    value={sortBy}
                    onChange={(e) => updateFilter('sort', e.target.value)}
                    className="appearance-none h-full w-full bg-[#13141F] border border-white/10 text-white pl-4 pr-10 rounded-xl focus:ring-2 focus:ring-purple-500/50 cursor-pointer text-sm font-bold hover:bg-[#1A1B26] transition-colors"
                  >
                    <option value="stars">Most Stars</option>
                    <option value="forks">Most Forks</option>
                    <option value="updated">Recently Updated</option>
                  </select>
                  <ArrowDownUp className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              )}
            </div>

            {currentView !== 'smart-search' && (
              <div className="relative group">
                 <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#0B0C15] to-transparent z-10 pointer-events-none sm:hidden" />
                 <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#0B0C15] to-transparent z-10 pointer-events-none sm:hidden" />

                 <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-2 scrollbar-hide mask-image-gradient">
                  <div className="flex items-center gap-2 mr-2 text-xs font-bold text-gray-500 uppercase tracking-wider sticky left-0">
                    <Filter className="w-3 h-3" /> Stack:
                  </div>
                  {['TypeScript', 'Python', 'Rust', 'Go', 'JavaScript','C','C++','Java'].map(lang => (
                    <button
                      key={lang}
                      onClick={() => updateFilter('language', activeLanguage === lang ? null : lang)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all whitespace-nowrap active:scale-95 ${
                        activeLanguage === lang
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.2)]'
                          : 'bg-white/5 text-gray-400 border-white/5 hover:border-white/20 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}

                  {(activeLanguage || urlQuery) && (
                    <button
                      onClick={() => { navigate(`/?view=${currentView}`); setLocalSearch(''); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-400 hover:bg-red-400/10 transition-colors flex items-center gap-1 ml-auto border border-transparent hover:border-red-400/20"
                    >
                      <RotateCcw className="w-3 h-3" /> Reset
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-3">
              {currentView === 'smart-search' ? (
                 <>
                   <div className="p-2 bg-purple-500/20 rounded-lg"><Sparkles className="w-5 h-5 text-purple-400" /></div>
                   {smartQueryParam ? 'AI Recommendations' : 'Intelligent Search'}
                 </>
              ) : (
                 <>
                   <div className="p-2 bg-gray-800/50 rounded-lg"><LayoutGrid className="w-5 h-5 text-gray-400" /></div>
                   {(urlQuery || activeLanguage) ? 'Search Results' : (
                     <>
                       {currentView === 'top-repos' && 'Most Starred Repositories'}
                       {currentView === 'trending-repos' && 'Active This Week'}
                       {currentView === 'growing-repos' && 'New & Growing'}
                       {currentView === 'trend-7d' && 'Past 7 Days Trends'}
                       {currentView === 'trend-30d' && 'Past 30 Days Trends'}
                       {currentView === 'trend-90d' && 'Past 90 Days Trends'}
                     </>
                   )}
                 </>
              )}
            </h2>
          </div>

          {isLoading ? (
             <div className="space-y-4">
               {[1,2,3].map(i => (
                 <div key={i} className="bg-[#13141F]/50 rounded-2xl p-6 border border-white/5 animate-pulse flex gap-4">
                    <div className="w-14 h-14 bg-white/5 rounded-xl" />
                    <div className="flex-1 space-y-3">
                       <div className="w-1/3 h-5 bg-white/5 rounded" />
                       <div className="w-2/3 h-4 bg-white/5 rounded" />
                    </div>
                 </div>
               ))}
             </div>
          ) : repos.length > 0 ? (
            <div className={`space-y-4 pb-20 transition-all duration-300 ${isValidating ? 'opacity-50 grayscale pointer-events-none' : 'opacity-100'}`}>
              {repos.map((repo, index) => renderRepositoryCard(repo, index))}
              {hasMore && !urlQuery && !activeLanguage && currentView === 'top-repos' && (
                 <div ref={observerTarget} className="py-8 flex justify-center items-center">
                   {isFetchingMore ? (
                     <div className="flex items-center gap-3 text-purple-400 text-sm font-bold bg-purple-500/10 px-4 py-2 rounded-full">
                       <div className="w-4 h-4 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
                       Loading more...
                     </div>
                   ) : <div className="h-4" />}
                 </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-32 bg-[#13141F]/30 rounded-3xl border border-white/5 border-dashed">
              {currentView === 'smart-search' ? (
                 <>
                   <div className="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center mb-6 ring-1 ring-purple-500/20">
                      <Sparkles className="w-8 h-8 text-purple-400" />
                   </div>
                   <h3 className="text-xl font-bold text-white mb-2">Ask AI anything</h3>
                   <p className="text-gray-500 text-center max-w-md">"Find me a library for real-time video processing in Rust"</p>
                 </>
              ) : (
                 <>
                   <div className="w-20 h-20 bg-gray-800/30 rounded-full flex items-center justify-center mb-6">
                      <Award className="w-8 h-8 text-gray-500" />
                   </div>
                   <h3 className="text-xl font-bold text-white mb-2">No repositories found</h3>
                   <p className="text-gray-500">Try adjusting your filters.</p>
                 </>
              )}
            </div>
          )}
        </main>
      </div>

      <button
        onClick={scrollToTop}
        className={`fixed bottom-8 right-8 p-4 bg-purple-600 text-white rounded-full shadow-lg shadow-purple-600/30 hover:bg-purple-500 hover:-translate-y-1 transition-all duration-300 z-50 ${showBackToTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}
      >
        <ArrowUp className="w-6 h-6" />
      </button>
    </div>
  );
}

export default RepositoryList;
