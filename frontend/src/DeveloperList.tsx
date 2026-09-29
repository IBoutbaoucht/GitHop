import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Trophy, TrendingUp, Users, Star, Code2,
  Zap, Award, X, Menu, Flame, ChevronRight,
  Briefcase, Brain, Link as LinkIcon, Cloud, Palette,
  Server, Shield, Database, Smartphone, Gamepad2, Cpu,
  CheckCircle2, ChevronLeft, Terminal, Activity, Layers, Layout, Sigma,
  ShieldCheck, Search, Medal, RotateCcw,
  Calendar, Clock, History, Sparkles, ArrowUp
} from 'lucide-react';

import { PERSONA_DEFINITIONS } from './constants/personas';
import { API_BASE } from './config';


interface Developer {
  id: number;
  login: string;
  name: string;
  avatar_url: string;
  bio?: string;
  total_stars_earned: number;
  followers_count: number;
  public_repos_count: number;
  dominant_language: string;
  badges: Array<{ type: string; category?: string }>;
  personas: Record<string, number>;
  is_rising_star: boolean;
  is_hall_of_fame: boolean;
  is_trending_expert: boolean;
  is_badge_holder: boolean;
  company?: string;
  is_organization?: boolean;
  velocity_score?: number;
  primary_work?: { repos: Array<{ name: string; stars: number }> };
  language_expertise?: { expertise: Array<{ language: string; level: string; repos_count: number }> };
}

const ICON_MAP: Record<string, any> = {
  ai_whisperer: Brain, ml_engineer: Activity, data_scientist: Database, computational_scientist: Sigma,
  data_engineer: Server, chain_architect: LinkIcon, cloud_native: Cloud, devops_deamon: Layers,
  systems_architect: Cpu, backend_behemoth: Server, frontend_wizard: Layout, ux_engineer: Palette,
  mobile_maestro: Smartphone, security_sentinel: Shield, game_guru: Gamepad2, iot_tinkerer: Cpu,
  tooling_titan: Terminal, algorithm_alchemist: Code2, qa_automator: CheckCircle2, enterprise_architect: Briefcase
};

// Configuration with Polite Rename Logic
const personaConfig = PERSONA_DEFINITIONS.reduce((acc, def) => {
  let label = def.label;
  // Polite override for "Backend Behemoth"
  if (def.id === 'backend_behemoth' || label === 'Backend Behemoth') {
    label = 'Backend Architect';
  }

  acc[def.id] = { label, color: def.color, icon: ICON_MAP[def.id] || Code2 };
  return acc;
}, {} as Record<string, { label: string; icon: any; color: string }>);

const viewThemes = {
  top: { bgGradient: 'from-amber-500/5 via-yellow-500/5 to-orange-500/5', borderColor: 'border-amber-500/30', accentColor: 'text-amber-400', icon: Trophy, metricLabel: 'Followers', emptyIcon: '👑', emptyText: 'The legends of open source', cardHoverGlow: 'hover:shadow-amber-500/20' },
  expert: { bgGradient: 'from-indigo-500/5 via-purple-500/5 to-pink-500/5', borderColor: 'border-indigo-500/30', accentColor: 'text-indigo-400', icon: Briefcase, metricLabel: 'Expertise', emptyIcon: '🎯', emptyText: 'Domain specialists and tech leaders', cardHoverGlow: 'hover:shadow-indigo-500/20' },
  rising: { bgGradient: 'from-emerald-500/5 via-cyan-500/5 to-blue-500/5', borderColor: 'border-emerald-500/30', accentColor: 'text-emerald-400', icon: Zap, metricLabel: 'Velocity', emptyIcon: '🚀', emptyText: 'Tomorrow\'s open source stars', cardHoverGlow: 'hover:shadow-emerald-500/20' },
  badge: { bgGradient: 'from-yellow-500/5 via-orange-500/5 to-red-500/5', borderColor: 'border-yellow-500/30', accentColor: 'text-yellow-400', icon: Medal, metricLabel: 'Followers', emptyIcon: '🎖️', emptyText: 'Award-winning community leaders', cardHoverGlow: 'hover:shadow-yellow-500/20' }
};

const formatNumber = (num: any) => {
  if (!num) return "0";
  const val = typeof num === "string" ? parseInt(num) : num;
  if (isNaN(val)) return "0";
  if (val >= 1000000) return (val/1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (val >= 1000) return (val/1000).toFixed(1).replace(/\.0$/, "") + "K";
  return val.toString();
}

function getClaimToFame(dev: Developer): string {
  if (dev.primary_work?.repos?.[0]?.name) {
    return `Created ${dev.primary_work.repos[0].name} • ${formatNumber(dev.primary_work.repos[0].stars)} stars`;
  }
  if (dev.language_expertise?.expertise?.[0]) {
    const exp = dev.language_expertise.expertise[0];
    return `${exp.language} ${exp.level} • ${exp.repos_count} projects`;
  }
  if (dev.bio && dev.bio.length > 0) {
    return dev.bio.slice(0, 60) + (dev.bio.length > 60 ? '...' : '');
  }
  return `${formatNumber(dev.public_repos_count)} public repositories`;
}

function DeveloperList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // 1. STATE DERIVATION
  const viewType = (searchParams.get('type') as 'top' | 'rising' | 'expert' | 'badge') || 'top';
  const selectedLang = searchParams.get('language');
  const selectedPersona = searchParams.get('persona');
  const selectedBadge = searchParams.get('badge');
  const urlQuery = searchParams.get('q') || '';

  // 2. UI STATE
  const [localSearch, setLocalSearch] = useState(urlQuery);
  const [devs, setDevs] = useState<Developer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);

  // Removed personaScrollRef as we are now wrapping the content
  const badgeScrollRef = useRef<HTMLDivElement>(null);
  const [showBadgeLeftArrow, setShowBadgeLeftArrow] = useState(false);
  const [showBadgeRightArrow, setShowBadgeRightArrow] = useState(true);
  const hasRestoredScroll = useRef(false);

  // 3. INPUT SYNC
  useEffect(() => { setLocalSearch(urlQuery); }, [urlQuery]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== urlQuery) updateFilter('q', localSearch || null);
    }, 500);
    return () => clearTimeout(timer);
  }, [localSearch]);

  // 4. FETCH LOGIC
  useEffect(() => {
    const controller = new AbortController();

    const fetchInitialData = async () => {
      if (devs.length === 0) setIsLoading(true); else setIsValidating(true);
      setCursor(null); hasRestoredScroll.current = false;
      try {
        const params = new URLSearchParams();
        params.set('type', viewType); params.set('limit', '30');
        if (urlQuery) params.set('q', urlQuery);
        if (selectedLang) params.set('language', selectedLang);
        if (selectedPersona) params.set('persona', selectedPersona);
        if (selectedBadge) params.set('badge', selectedBadge);

        const res = await fetch(`${API_BASE}/developers?${params.toString()}`, { signal: controller.signal });
        if (!res.ok) throw new Error('Network error');

        const json = await res.json();
        setDevs(json.data || []); setCursor(json.nextCursor || null);
      } catch (e: any) {
        if (e.name !== 'AbortError') console.error(e);
      } finally {
        if (!controller.signal.aborted) {
            setIsLoading(false); setIsValidating(false);
        }
      }
    };

    const timer = setTimeout(fetchInitialData, 50);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [viewType, selectedLang, selectedPersona, selectedBadge, urlQuery]);

  const loadMore = useCallback(async () => {
    if (!cursor || isFetchingMore || isLoading || isValidating) return;
    setIsFetchingMore(true);
    try {
        const params = new URLSearchParams();
        params.set('type', viewType); params.set('limit', '30'); params.set('cursor', cursor);
        if (urlQuery) params.set('q', urlQuery);
        if (selectedLang) params.set('language', selectedLang);
        if (selectedPersona) params.set('persona', selectedPersona);
        if (selectedBadge) params.set('badge', selectedBadge);
        const res = await fetch(`${API_BASE}/developers?${params.toString()}`);
        const json = await res.json();
        setDevs(prev => [...prev, ...(json.data || [])]); setCursor(json.nextCursor || null);
    } catch (e) { console.error("Pagination error:", e); } finally { setIsFetchingMore(false); }
  }, [cursor, isFetchingMore, isLoading, isValidating, viewType, selectedLang, selectedPersona, selectedBadge, urlQuery]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting && cursor) loadMore(); },
      { threshold: 0.1, rootMargin: '100px' }
    );
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => { if (observerTarget.current) observer.unobserve(observerTarget.current); };
  }, [loadMore, cursor]);

  // 5. HELPERS
  const updateFilter = (key: string, value: string | null) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      if (value) newParams.set(key, value); else newParams.delete(key);
      if (!newParams.has('type')) newParams.set('type', viewType);
      return newParams;
    }, { replace: true });
  };

  const handleSidebarClick = (viewId: string) => {
    setIsMobileMenuOpen(false);
    const repoViews = ['top-repos', 'trending-repos', 'growing-repos', 'smart-search', 'trend-7d', 'trend-30d', 'trend-90d'];
    if (repoViews.includes(viewId)) { navigate(`/?view=${viewId}`); return; }
    let newType = 'top';
    if (viewId === 'growing-devs') newType = 'rising';
    if (viewId === 'expert-devs') newType = 'expert';
    if (viewId === 'badge-devs') newType = 'badge';
    navigate(`/developers?type=${newType}`);
  };

  const clearAllFilters = () => navigate(`/developers?type=${viewType}`);
  const handleHomeClick = () => navigate('/');
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  // 6. SCROLL UX
  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    const key = `scroll_pos_dev_${viewType}_${selectedLang || 'all'}_${selectedPersona || 'all'}_${urlQuery || 'none'}`;

    if (!isLoading && devs.length > 0 && !hasRestoredScroll.current) {
      const saved = sessionStorage.getItem(key);
      if (saved) {
        requestAnimationFrame(() => window.scrollTo(0, parseInt(saved, 10)));
      }
      hasRestoredScroll.current = true;
    }

    const handleScroll = () => {
        if (!isLoading) sessionStorage.setItem(key, window.scrollY.toString());
        setShowBackToTop(window.scrollY > 500);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLoading, viewType, selectedLang, selectedPersona, urlQuery, devs.length]);

  // Badge Horizontal Scroll Logic (Maintained as is, since prompt only mentioned expert categories)
  useEffect(() => {
    const checkBadgeScroll = () => {
        if (badgeScrollRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = badgeScrollRef.current;
            setShowBadgeLeftArrow(scrollLeft > 5);
            setShowBadgeRightArrow(scrollLeft < scrollWidth - clientWidth - 5);
        }
    };

    const ref = badgeScrollRef.current;
    if (!ref) return;

    ref.addEventListener('scroll', checkBadgeScroll);
    const resizeObserver = new ResizeObserver(() => checkBadgeScroll());
    resizeObserver.observe(ref);
    checkBadgeScroll();

    return () => {
        ref.removeEventListener('scroll', checkBadgeScroll);
        resizeObserver.disconnect();
    };
  }, [viewType, devs]);

  const scrollContainer = (ref: React.RefObject<HTMLDivElement>, direction: 'left' | 'right') => {
    if (ref.current) ref.current.scrollBy({ left: direction === 'left' ? -300 : 300, behavior: 'smooth' });
  };

  // --- SUB-COMPONENTS ---
  const SidebarItem = ({ id, icon: Icon, label, activeId }: any) => {
    const getActiveIdFromURL = () => {
      if (viewType === 'expert') return 'expert-devs';
      if (viewType === 'rising') return 'growing-devs';
      if (viewType === 'badge') return 'badge-devs';
      return 'top-devs';
    };
    const calculatedActiveId = activeId || getActiveIdFromURL();
    const isActuallyActive = calculatedActiveId === id;
    const isExternalContext = ['top-repos', 'trending-repos', 'growing-repos', 'smart-search', 'trend-7d', 'trend-30d', 'trend-90d'].includes(id);

    return (
      <button
        onClick={() => handleSidebarClick(id)}
        className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all duration-300 group relative overflow-hidden ${
          isActuallyActive
            ? 'bg-gradient-to-r from-purple-600/90 to-pink-600/90 text-white shadow-lg shadow-purple-500/20 border border-white/10'
            : 'text-gray-400 hover:bg-white/5 hover:text-white border border-transparent hover:border-white/5'
        }`}
      >
        <div className="flex items-center gap-3 z-10">
          <Icon className={`w-5 h-5 transition-transform duration-300 ${isActuallyActive ? 'scale-110' : 'group-hover:scale-110'} ${isActuallyActive ? 'text-white' : isExternalContext ? 'text-gray-600 group-hover:text-purple-400' : 'text-gray-500 group-hover:text-purple-400'}`} />
          <span className={`font-medium tracking-wide ${isActuallyActive ? 'text-white' : ''}`}>{label}</span>
        </div>
        {isActuallyActive && <ChevronRight className="w-4 h-4 text-white/80" />}
      </button>
    );
  };

  const DeveloperCard = ({ dev, index, currentView, hideRank }: { dev: Developer; index: number; currentView: string; hideRank?: boolean; }) => {
    const rank = index + 1;
    const theme = viewThemes[currentView as keyof typeof viewThemes] || viewThemes.top;

    const getMetricValue = () => {
      if (currentView === 'top' || currentView === 'badge') return formatNumber(dev.followers_count);
      if (currentView === 'rising') return `+${formatNumber(Math.round(dev.velocity_score || 0))}/mo`;
      if (currentView === 'expert') return dev.language_expertise?.expertise?.length || 0;
    };

    return (
      <div
        onClick={() => navigate(`/developer/${dev.login}`)}
        className={`group relative bg-gradient-to-br ${theme.bgGradient} backdrop-blur-sm rounded-2xl p-6 border ${theme.borderColor} hover:border-opacity-100 transition-all duration-300 cursor-pointer shadow-lg ${theme.cardHoverGlow} hover:scale-[1.01] hover:-translate-y-1`}
      >
        {!hideRank && (
          <div className="absolute top-3 left-3 w-8 h-8 rounded-lg bg-gray-900/80 backdrop-blur-sm border border-white/10 flex items-center justify-center text-sm font-bold text-gray-400 group-hover:text-purple-400 group-hover:border-purple-500/50 transition-all shadow-inner">
            #{rank}
          </div>
        )}

        {(currentView === 'top' || currentView === 'badge') && (
           <div className={`absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/20 backdrop-blur-md border border-white/5 ${theme.accentColor} shadow-inner`}>
              <Users className="w-3 h-3" />
              <span className="font-bold text-xs">{getMetricValue()}</span>
           </div>
        )}

        <div className="flex items-center gap-4 ml-10">
          <div className="relative flex-shrink-0">
            <img
              src={dev.avatar_url}
              alt={dev.login}
              className="w-14 h-14 rounded-full border-2 border-gray-700 group-hover:border-purple-500/50 transition-colors shadow-lg"
              loading="lazy"
            />
            {dev.is_rising_star && (
              <div className="absolute -bottom-1 -right-1 bg-gradient-to-r from-orange-500 to-red-500 p-1 rounded-full border-2 border-gray-900 shadow-lg">
                <TrendingUp className="w-3 h-3 text-white" />
              </div>
            )}
            {dev.is_organization && (
              <div className="absolute -bottom-1 -right-1 bg-purple-500 p-1 rounded-full border-2 border-gray-900 shadow-lg">
                <Users className="w-3 h-3 text-white" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-bold text-white group-hover:text-purple-300 transition truncate tracking-tight">
                {dev.name || dev.login}
              </h3>
              <span className="text-xs text-gray-500 font-medium">@{dev.login}</span>
            </div>

            <p className="text-sm text-gray-400 mb-2 line-clamp-1 group-hover:text-gray-300 transition">
              {getClaimToFame(dev)}
            </p>

            <div className="flex items-center gap-2 flex-wrap">
              {currentView === 'expert' ? (
                (() => {
                  const entries = Object.entries(dev.personas || {});
                  if (entries.length === 0) return null;

                  const topPersona = entries.sort((a: any, b: any) => (b[1] as number) - (a[1] as number))[0];

                  if (topPersona && (topPersona[1] as number) > 0) {
                    const [key] = topPersona;
                    const config = personaConfig[key];
                    if (config) return (<span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${config.color} bg-black/20`}><config.icon className="w-3.5 h-3.5" />{config.label}</span>);
                  }
                  return null;
                })()
              ) : currentView === 'badge' ? (
                 dev.badges?.map((b: any, i: number) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
                    <Medal className="w-3 h-3" /> {b.type}
                  </span>
                ))
              ) : (
                dev.badges?.length > 0 && (
                   <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      <ShieldCheck className="w-3 h-3" /> {dev.badges[0].type}
                    </span>
                )
              )}
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
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-pink-600/10 rounded-full blur-[120px] opacity-50"></div>
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
              <button onClick={handleHomeClick} className="cursor-pointer text-left group">
                <h1 className="text-2xl font-bold tracking-tight text-white hidden sm:block">
                  Git<span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 group-hover:brightness-110 transition-all">Hop</span>
                </h1>
              </button>
            </div>
            <div className="text-sm font-bold text-gray-500 hidden sm:block">Developer Intelligence</div>
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
                <SidebarItem id="trend-7d" icon={Clock} label="Past 7 Days" />
                <SidebarItem id="trend-30d" icon={Calendar} label="Past 30 Days" />
                <SidebarItem id="trend-90d" icon={Activity} label="Past 90 Days" />
              </nav>
            </div>

            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 px-4">Repositories</h3>
              <nav className="space-y-2">
                <SidebarItem id="top-repos" icon={Star} label="Top Rated" />
                <SidebarItem id="trending-repos" icon={Flame} label="Active Coding" />
                <SidebarItem id="growing-repos" icon={TrendingUp} label="New Arrivals" />
                <SidebarItem id="smart-search" icon={Sparkles} label="Intelligent Search" />
              </nav>
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 px-4">Developers</h3>
              <nav className="space-y-2">
                <SidebarItem id="top-devs" icon={Users} label="Hall of Fame" />
                <SidebarItem id="badge-devs" icon={Award} label="Badge Holders" />
                <SidebarItem id="expert-devs" icon={Briefcase} label="Trending Experts" />
                <SidebarItem id="growing-devs" icon={Zap} label="Rising Stars" />
              </nav>
            </div>
          </div>
        </aside>

        {isMobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-40 bg-[#0B0C15]/95 backdrop-blur-2xl pt-24 px-6 animate-in slide-in-from-left-5 duration-300">
             <div className="space-y-8">
                <SidebarItem id="top-repos" icon={Star} label="Browse Repositories" />
                <SidebarItem id="smart-search" icon={Sparkles} label="AI Search" />
                <div className="h-px bg-white/10" />
                <SidebarItem id="top-devs" icon={Users} label="Hall of Fame" />
                <SidebarItem id="expert-devs" icon={Briefcase} label="Trending Experts" />
             </div>
          </div>
        )}

        <main className="flex-1 px-4 sm:px-6 py-8 min-w-0">
             <div className="mb-8">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                            {viewThemes[viewType as keyof typeof viewThemes].icon &&
                               (() => {
                                 const Icon = viewThemes[viewType as keyof typeof viewThemes].icon;
                                 return <div className={`p-2 rounded-lg bg-white/5`}><Icon className={`w-8 h-8 ${viewThemes[viewType as keyof typeof viewThemes].accentColor}`} /></div>;
                               })()
                            }

                            {viewType === 'top' && 'Global Hall of Fame'}
                            {viewType === 'expert' && 'Trending Experts'}
                            {viewType === 'rising' && 'Rising Stars'}
                            {viewType === 'badge' && 'Community Leaders'}
                        </h1>
                        <p className="text-gray-400">
                            {viewType === 'top' && 'The most influential developers in open source history.'}
                            {viewType === 'expert' && 'Leaders in trending domains (AI, Rust, Web3).'}
                            {viewType === 'rising' && 'High-velocity talent < 2 years in the game.'}
                            {viewType === 'badge' && 'Developers recognized by major tech organizations.'}
                        </p>
                    </div>
                </div>

                <div className="space-y-6">
                  {/* Search and Clear Filters */}
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative group flex-1">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-gray-500 group-focus-within:text-purple-400 transition-colors" />
                      </div>
                      <input
                        type="text"
                        className="block w-full pl-12 pr-12 py-4 bg-[#13141F] border border-white/10 rounded-2xl text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all text-base font-medium shadow-lg backdrop-blur-sm"
                        placeholder={`Search ${viewType === 'top' ? 'legends' : viewType === 'expert' ? 'experts' : viewType === 'badge' ? 'badge holders' : 'rising stars'}...`}
                        value={localSearch}
                        onChange={(e) => setLocalSearch(e.target.value)}
                      />
                      {localSearch && (
                        <button
                          onClick={() => setLocalSearch('')}
                          className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-white transition-colors"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      )}
                    </div>

                    {(selectedLang || selectedPersona || selectedBadge || urlQuery) && (
                      <button
                        onClick={clearAllFilters}
                        className="flex items-center justify-center px-6 py-4 rounded-2xl border border-white/10 bg-[#13141F] hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 text-gray-400 font-medium transition-all group"
                      >
                        <RotateCcw className="w-5 h-5 mr-2 group-hover:-rotate-180 transition-transform duration-500" />
                        Clear Filters
                      </button>
                    )}
                  </div>

                  {/* Tech Stack Filter */}
                  <div className="flex items-center gap-4">
                    <div className="relative group flex-1 min-w-0">
                      <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-[#0B0C15] to-transparent z-10 pointer-events-none" />
                      <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-[#0B0C15] to-transparent z-10 pointer-events-none" />

                      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                          <div className="flex items-center gap-2 mr-2 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap px-2 border-l border-white/10 ml-2 pl-4 sticky left-0 z-20">
                             Stack:
                          </div>
                          {['Rust', 'TypeScript', 'Python', 'Go', 'C++', 'Java', 'Kotlin', 'Swift'].map(lang => (
                          <button
                              key={lang}
                              onClick={() => updateFilter('language', selectedLang === lang ? null : lang)}
                              className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all whitespace-nowrap active:scale-95 ${
                              selectedLang === lang
                                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.2)]'
                                  : 'bg-white/5 text-gray-400 border-white/5 hover:border-white/20 hover:text-white hover:bg-white/10'
                              }`}
                          >
                              {lang}
                          </button>
                          ))}
                      </div>
                    </div>
                    <div className="shrink-0 pl-1 hidden sm:block">
                       <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                         Found <span className="text-white">{formatNumber(devs.length)}</span> Devs
                       </span>
                    </div>
                  </div>

                  {/* Persona Filter (Expert View) - UPDATED to Wrap Layout */}
                  {viewType === 'expert' && (
                    <div className="animate-in slide-in-from-top-4 fade-in duration-500">
                        <div className="flex items-center gap-2 mb-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                          <Brain className="w-4 h-4 text-purple-400" /> Filter by Role:
                        </div>
                        <div className="flex flex-wrap gap-3">
                            {Object.entries(personaConfig).map(([key, config]) => (
                            <button
                              key={key}
                              onClick={() => updateFilter('persona', selectedPersona === key ? null : key)}
                              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all duration-300 active:scale-95 ${selectedPersona === key ? `${config.color.replace('bg-opacity-10', 'bg-opacity-20')} border-opacity-50 shadow-[0_0_15px_rgba(0,0,0,0.3)] scale-[1.02]` : 'bg-[#13141F] text-gray-400 border-white/5 hover:border-white/20 hover:text-white hover:bg-white/5'}`}
                            >
                              <div className={`p-1 rounded-md ${selectedPersona === key ? 'bg-white/10' : 'bg-black/20'}`}>
                                <config.icon className="w-3.5 h-3.5" />
                              </div>
                              {config.label}
                            </button>
                            ))}
                        </div>
                    </div>
                  )}

                  {/* Badge Filter (Badge View) */}
                  {viewType === 'badge' && (
                    <div className="relative group animate-in slide-in-from-top-4 fade-in duration-500">
                      <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#0B0C15] to-transparent z-10 pointer-events-none" />
                      <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#0B0C15] to-transparent z-10 pointer-events-none" />

                      {showBadgeLeftArrow && <button onClick={() => scrollContainer(badgeScrollRef, 'left')} className="absolute left-0 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-gray-800/80 backdrop-blur-md border border-white/10 text-white shadow-lg hover:bg-gray-700 transition-all -ml-2"><ChevronLeft className="w-4 h-4" /></button>}
                      {showBadgeRightArrow && <button onClick={() => scrollContainer(badgeScrollRef, 'right')} className="absolute right-0 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-gray-800/80 backdrop-blur-md border border-white/10 text-white shadow-lg hover:bg-gray-700 transition-all -mr-2"><ChevronRight className="w-4 h-4" /></button>}
                      <div ref={badgeScrollRef} className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide px-1 snap-x">
                          <div className="flex items-center gap-2 mr-2 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap sticky left-0 z-0 pl-4"><Award className="w-4 h-4 text-yellow-400" /> Filter:</div>
                          {['GDE', 'GitHub Star', 'MVP', 'AWS Hero', 'Docker Captain', 'CKA', 'AWS Solutions Architect', 'CISSP', 'PSM', 'CCIE'].map(badge => (
                          <button key={badge} onClick={() => updateFilter('badge', selectedBadge === badge ? null : badge)} className={`flex-shrink-0 snap-start flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all duration-300 active:scale-95 ${selectedBadge === badge ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.3)] scale-[1.02]' : 'bg-gray-800/30 text-gray-400 border-white/5 hover:border-white/20 hover:text-white hover:bg-gray-800/60'}`}>{badge}</button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
             </div>

            {/* List Content */}
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
            ) : devs.length > 0 ? (
              <div
                className={`space-y-4 pb-20 transition-all duration-300 ${
                  isValidating ? 'opacity-50 grayscale pointer-events-none' : 'opacity-100'
                }`}
              >
                {devs.map((dev, idx) => (
                  <DeveloperCard
                    key={dev.id}
                    dev={dev}
                    index={idx}
                    currentView={viewType}
                    hideRank={!!(selectedLang || selectedPersona || selectedBadge || urlQuery)}
                  />
                ))}

                {cursor && (
                   <div ref={observerTarget} className="py-8 flex justify-center items-center">
                       {isFetchingMore ? (
                           <div className="flex items-center gap-3 text-purple-400 text-sm font-bold bg-purple-500/10 px-4 py-2 rounded-full">
                               <div className="w-4 h-4 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
                               Fetching more developers...
                           </div>
                       ) : <div className="h-4" />}
                   </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-32 bg-[#13141F]/30 rounded-3xl border border-white/5 border-dashed">
                <div className="text-6xl mb-6 grayscale opacity-50">{viewThemes[viewType as keyof typeof viewThemes].emptyIcon}</div>
                <h3 className="text-xl font-bold text-white mb-2">No developers found</h3>
                <p className="text-gray-500 mb-6">{viewThemes[viewType as keyof typeof viewThemes].emptyText}</p>
                {(selectedLang || selectedPersona || selectedBadge || urlQuery) && (
                   <button onClick={clearAllFilters} className="px-6 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 rounded-lg text-sm font-bold transition-colors border border-purple-500/20">
                      Clear Filters
                   </button>
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

export default DeveloperList;
