import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Trophy, TrendingUp, Users, Star, Code2, 
  Zap, Award, X, Menu, Flame, ChevronRight, Filter,
  Briefcase, Brain, Link, Cloud, Palette,
  Server, Shield, Database, Smartphone, Gamepad2, Cpu,
  CheckCircle2, ChevronLeft, Terminal, Activity, Layers, Layout, Sigma
} from 'lucide-react';

// --- Types ---
interface Developer {
  id: number;
  login: string;
  name: string;
  avatar_url: string;
  total_stars_earned: number;
  followers_count: number;
  dominant_language: string;
  badges: Array<{ type: string; category?: string }>;
  personas: Record<string, number>;
  is_rising_star: boolean;
  company?: string;
  scout_source?: string;
  is_organization?: boolean;
}

const API_BASE = '/api';

const langColors: Record<string, string> = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', 
  Java: '#b07219', Go: '#00ADD8', Rust: '#dea584', 'C++': '#f34b7d',
};

const personaConfig: Record<string, { label: string; icon: any; color: string }> = {
  ai_whisperer: { label: 'AI Whisperer', icon: Brain, color: 'text-pink-400 bg-pink-400/10 border-pink-400/20' },
  ml_engineer: { label: 'ML Engineer', icon: Activity, color: 'text-rose-400 bg-rose-400/10 border-rose-400/20' },
  data_scientist: { label: 'Data Scientist', icon: Database, color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  computational_scientist: { label: 'Comp. Scientist', icon: Sigma, color: 'text-violet-400 bg-violet-400/10 border-violet-400/20' },
  data_engineer: { label: 'Data Engineer', icon: Server, color: 'text-orange-400 bg-orange-400/10 border-orange-400/20' },
  chain_architect: { label: 'Chain Architect', icon: Link, color: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20' },
  cloud_native: { label: 'Cloud Native', icon: Cloud, color: 'text-sky-400 bg-sky-400/10 border-sky-400/20' },
  devops_deamon: { label: 'DevOps Deamon', icon: Layers, color: 'text-slate-400 bg-slate-400/10 border-slate-400/20' },
  systems_architect: { label: 'Systems Architect', icon: Cpu, color: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20' },
  backend_behemoth: { label: 'Backend Behemoth', icon: Server, color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
  frontend_wizard: { label: 'Frontend Wizard', icon: Layout, color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
  ux_engineer: { label: 'UX Engineer', icon: Palette, color: 'text-fuchsia-400 bg-fuchsia-400/10 border-fuchsia-400/20' },
  mobile_maestro: { label: 'Mobile Maestro', icon: Smartphone, color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  security_sentinel: { label: 'Security Sentinel', icon: Shield, color: 'text-red-400 bg-red-400/10 border-red-400/20' },
  game_guru: { label: 'Game Guru', icon: Gamepad2, color: 'text-lime-400 bg-lime-400/10 border-lime-400/20' },
  iot_tinkerer: { label: 'IoT Tinkerer', icon: Cpu, color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20' },
  tooling_titan: { label: 'Tooling Titan', icon: Terminal, color: 'text-gray-300 bg-gray-500/10 border-gray-500/20' },
  algorithm_alchemist: { label: 'Algorithm Alchemist', icon: Code2, color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
  qa_automator: { label: 'QA Automator', icon: CheckCircle2, color: 'text-teal-400 bg-teal-400/10 border-teal-400/20' },
  enterprise_architect: { label: 'Enterprise Architect', icon: Briefcase, color: 'text-blue-300 bg-blue-300/10 border-blue-300/20' },
};

type ViewType = 'top' | 'rising' | 'expert';

function DeveloperList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const personaScrollRef = useRef<HTMLDivElement>(null);

  // --- 1. Initialize State with Storage Check ---
  const [viewType, setViewType] = useState<ViewType>(() => {
    const type = searchParams.get('type');
    if (type === 'rising') return 'rising';
    if (type === 'expert') return 'expert';
    return 'top';
  });
  
  const [selectedLang, setSelectedLang] = useState<string | null>(() => {
    return sessionStorage.getItem(`filter_lang_${viewType}`) || null;
  });

  const [selectedPersona, setSelectedPersona] = useState<string | null>(() => {
    return sessionStorage.getItem(`filter_persona_${viewType}`) || null;
  });

  const [devs, setDevs] = useState<Developer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  // --- 2. Persistence Effects ---

  useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem(`scroll_pos_dev_${viewType}`, window.scrollY.toString());
    };
    let throttleTimer: NodeJS.Timeout | null = null;
    const onScroll = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => { handleScroll(); throttleTimer = null; }, 100);
    };
    window.addEventListener('scroll', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (throttleTimer) clearTimeout(throttleTimer);
    };
  }, [viewType]);

  useEffect(() => {
    if (selectedLang) sessionStorage.setItem(`filter_lang_${viewType}`, selectedLang);
    else sessionStorage.removeItem(`filter_lang_${viewType}`);

    if (selectedPersona) sessionStorage.setItem(`filter_persona_${viewType}`, selectedPersona);
    else sessionStorage.removeItem(`filter_persona_${viewType}`);
  }, [selectedLang, selectedPersona, viewType]);

  useEffect(() => {
    const typeParam = searchParams.get('type');
    let newView: ViewType = 'top';
    if (typeParam === 'rising') newView = 'rising';
    if (typeParam === 'expert') newView = 'expert';
    
    setViewType(newView);

    const savedLang = sessionStorage.getItem(`filter_lang_${newView}`);
    const savedPersona = sessionStorage.getItem(`filter_persona_${newView}`);
    
    setSelectedLang(savedLang);
    setSelectedPersona(savedPersona);
  }, [searchParams]);

  useLayoutEffect(() => {
    if (!isLoading && devs.length > 0) {
      const savedPosition = sessionStorage.getItem(`scroll_pos_dev_${viewType}`);
      if (savedPosition) window.scrollTo(0, parseInt(savedPosition, 10));
    }
  }, [isLoading, viewType, devs]);

  // --- 3. Data Fetching ---

  useEffect(() => {
    fetchDevelopers();
  }, [viewType, selectedLang, selectedPersona]);

  const fetchDevelopers = async () => {
    setIsLoading(true);
    try {
      let url = `${API_BASE}/developers?type=${viewType}&limit=200`;
      if (selectedLang) url += `&language=${encodeURIComponent(selectedLang)}`;
      if (selectedPersona) url += `&persona=${encodeURIComponent(selectedPersona)}`;
      
      const res = await fetch(url);
      const json = await res.json();
      setDevs(json.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  // --- 4. Scroll & UI Handlers ---

  const handleScrollArrows = () => {
    if (personaScrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = personaScrollRef.current;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    const ref = personaScrollRef.current;
    if (ref) {
      ref.addEventListener('scroll', handleScrollArrows);
      handleScrollArrows();
      return () => ref.removeEventListener('scroll', handleScrollArrows);
    }
  }, [viewType]);

  const scrollPersonas = (direction: 'left' | 'right') => {
    if (personaScrollRef.current) {
      const amount = 300;
      personaScrollRef.current.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
    }
  };

  const handleSidebarClick = (view: string) => {
    setIsMobileMenuOpen(false);
    if (view === 'top-repos') navigate('/?view=top-repos');
    if (view === 'trending-repos') navigate('/?view=trending-repos');
    if (view === 'growing-repos') navigate('/?view=growing-repos');
    if (view === 'top-devs') { navigate('/developers?type=top'); setViewType('top'); }
    if (view === 'expert-devs') { navigate('/developers?type=expert'); setViewType('expert'); }
    if (view === 'growing-devs') { navigate('/developers?type=rising'); setViewType('rising'); }
  };

  const handleHomeClick = () => {
      navigate('/');
  };

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num?.toString() || '0';
  };

  const SidebarItem = ({ id, icon: Icon, label, activeId }: any) => {
    const isActive = activeId === id;
    return (
      <button
        onClick={() => handleSidebarClick(id)}
        className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all duration-300 group relative overflow-hidden ${
          isActive
            ? 'bg-gradient-to-r from-purple-600/90 to-pink-600/90 text-white shadow-lg shadow-purple-500/20 border border-white/10'
            : 'text-gray-400 hover:bg-gray-800/50 hover:text-white border border-transparent hover:border-gray-700/50'
        }`}
      >
        <div className="flex items-center gap-3 z-10">
          <Icon className={`w-5 h-5 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110 text-gray-500 group-hover:text-purple-400'}`} />
          <span className={`font-medium tracking-wide ${isActive ? 'text-white' : ''}`}>{label}</span>
        </div>
        {isActive && <ChevronRight className="w-4 h-4 text-white/80" />}
      </button>
    );
  };

  const StatBadge = ({ icon: Icon, label, value, color }: any) => (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${color} bg-opacity-10`}>
      <Icon className="w-3.5 h-3.5" />
      <div className="flex flex-col leading-none">
        <span className="text-[10px] uppercase font-bold opacity-70">{label}</span>
        <span className="text-xs font-bold">{value}</span>
      </div>
    </div>
  );

  const DevSkeleton = () => (
    <div className="bg-gray-800/40 rounded-2xl p-6 border border-gray-700/30 flex items-center gap-6 animate-pulse">
        <div className="w-12 h-12 bg-gray-700/50 rounded-xl"></div>
        <div className="w-16 h-16 bg-gray-700/50 rounded-full"></div>
        <div className="flex-1 space-y-2">
            <div className="w-1/3 h-5 bg-gray-700/50 rounded"></div>
            <div className="w-1/4 h-3 bg-gray-800/50 rounded"></div>
        </div>
        <div className="flex gap-2">
            <div className="w-20 h-10 bg-gray-800/50 rounded"></div>
            <div className="w-20 h-10 bg-gray-800/50 rounded"></div>
        </div>
    </div>
  );

  const DeveloperCard = ({ dev, index, currentView }: { dev: Developer; index: number; currentView: ViewType }) => {
    const rank = index + 1;
    const langColor = langColors[dev.dominant_language] || '#6366f1';
    
    // Top Persona Logic
    const topPersonaEntry = Object.entries(dev.personas || {}).sort((a, b) => b[1] - a[1])[0]; 
    const topScore = topPersonaEntry?.[1] as number;
    const topKey = topPersonaEntry?.[0];
    const config = topKey ? personaConfig[topKey] : null;

    // Helper: Expertise Tier
    const getTier = (s: number) => {
       if (s >= 90) return "Master";
       if (s >= 75) return "Expert";
       if (s >= 50) return "Specialist";
       if (s >= 25) return "Practitioner";
       return null;
    }
    const tier = getTier(topScore);
    
    return (
      <div 
        onClick={() => navigate(`/developer/${dev.login}`)}
        className="group relative bg-gray-800/40 backdrop-blur-md rounded-2xl p-6 border border-gray-700/30 hover:border-purple-500/40 hover:bg-gray-800/60 transition-all duration-300 cursor-pointer flex items-center gap-6"
      >
        <div className="hidden sm:flex flex-shrink-0 w-12 h-12 items-center justify-center font-bold text-xl text-gray-600 group-hover:text-purple-400 transition-colors">#{rank}</div>

        <div className="relative">
          <img src={dev.avatar_url} alt={dev.login} className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-gray-700 group-hover:border-purple-500 transition-colors" />
          {dev.is_rising_star && (
            <div className="absolute -bottom-1 -right-1 bg-gradient-to-r from-orange-500 to-red-500 p-1 rounded-full border border-gray-900" title="Rising Star">
              <TrendingUp className="w-3 h-3 text-white" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-lg font-bold text-white group-hover:text-purple-300 transition truncate">{dev.name || dev.login}</h3>
            <span className="text-sm text-gray-500">@{dev.login}</span>
            <div className="flex gap-1">
              {dev.is_organization ? (
                 <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1">
                   <Users className="w-3 h-3" /> Org
                 </span>
              ) : (
                dev.badges.map((b, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">{b.type}</span>
                ))
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm text-gray-400 mb-3">
            {dev.company && <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {dev.company}</span>}
            
            {/* Badge Logic */}
            {currentView === 'expert' && config && tier ? (
               <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold border ${config.color}`}>
                  <config.icon className="w-3 h-3" />
                  {config.label} {tier}
               </span>
            ) : dev.dominant_language && (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: langColor }} />
                {dev.dominant_language} Expert
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <StatBadge icon={Star} label="Impact" value={formatNumber(dev.total_stars_earned)} color="border-yellow-500/30 text-yellow-400 bg-yellow-500/10"/>
          <StatBadge icon={Users} label="Followers" value={formatNumber(dev.followers_count)} color="border-blue-500/30 text-blue-400 bg-blue-500/10"/>
        </div>
      </div>
    );
  };

  const getActiveId = () => {
    if (viewType === 'expert') return 'expert-devs';
    if (viewType === 'rising') return 'growing-devs';
    return 'top-devs';
  };

  return (
    <div className="min-h-screen bg-[#0B0C15] text-white selection:bg-purple-500/30">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-pink-600/10 rounded-full blur-[120px]"></div>
      </div>

       <header className="sticky top-0 z-50 bg-[#0B0C15]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
               <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="lg:hidden p-2 text-gray-400 hover:text-white bg-white/5 rounded-lg">
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
            <div className="text-sm font-bold text-gray-500">Developer Intelligence</div>
          </div>
        </div>
      </header>

      <div className="flex max-w-[1600px] mx-auto relative z-10">
         <aside className="hidden lg:block w-72 sticky top-24 h-[calc(100vh-6rem)] p-6">
          <div className="space-y-8">
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 px-4">Repositories</h3>
              <nav className="space-y-2">
                <SidebarItem id="top-repos" icon={Star} label="Top Rated" activeId={getActiveId()} />
                <SidebarItem id="trending-repos" icon={Flame} label="Trending Now" activeId={getActiveId()} />
                <SidebarItem id="growing-repos" icon={TrendingUp} label="Fast Growing" activeId={getActiveId()} />
              </nav>
            </div>
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 px-4">Developers</h3>
              <nav className="space-y-2">
                <SidebarItem id="top-devs" icon={Users} label="Hall of Fame" activeId={getActiveId()} />
                <SidebarItem id="expert-devs" icon={Briefcase} label="Trending Experts" activeId={getActiveId()} />
                <SidebarItem id="growing-devs" icon={Zap} label="Rising Stars" activeId={getActiveId()} />
              </nav>
            </div>
          </div>
        </aside>

        {isMobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-40 bg-[#0B0C15]/95 backdrop-blur-xl pt-24 px-6 animate-in slide-in-from-left-10 duration-200">
             <div className="space-y-8">
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Repositories</h3>
                  <div className="space-y-2">
                    <SidebarItem id="top-repos" icon={Star} label="Top Rated" activeId={getActiveId()} />
                    <SidebarItem id="trending-repos" icon={Flame} label="Trending Now" activeId={getActiveId()} />
                    <SidebarItem id="growing-repos" icon={TrendingUp} label="Fast Growing" activeId={getActiveId()} />
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Developers</h3>
                  <div className="space-y-2">
                    <SidebarItem id="top-devs" icon={Users} label="Hall of Fame" activeId={getActiveId()} />
                    <SidebarItem id="expert-devs" icon={Briefcase} label="Trending Experts" activeId={getActiveId()} />
                    <SidebarItem id="growing-devs" icon={Zap} label="Rising Stars" activeId={getActiveId()} />
                  </div>
                </div>
             </div>
          </div>
        )}

        <main className="flex-1 px-4 sm:px-6 py-8 min-w-0">
             <div className="mb-8">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                            {viewType === 'top' && <Trophy className="w-8 h-8 text-yellow-500" />}
                            {viewType === 'expert' && <Briefcase className="w-8 h-8 text-blue-500" />}
                            {viewType === 'rising' && <Zap className="w-8 h-8 text-orange-500" />}
                            
                            {viewType === 'top' && 'Global Hall of Fame'}
                            {viewType === 'expert' && 'Trending Experts'}
                            {viewType === 'rising' && 'Rising Stars'}
                        </h1>
                        <p className="text-gray-400">
                            {viewType === 'top' && 'The most influential developers in open source history.'}
                            {viewType === 'expert' && 'Leaders in trending domains (AI, Rust, Web3).'}
                            {viewType === 'rising' && 'High-velocity talent < 2 years in the game.'}
                        </p>
                    </div>
                </div>

                <div className="space-y-6">
                  {/* ACTIVE FILTERS BAR */}
                  {(selectedLang || selectedPersona) && (
                    <div className="flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-top-1 bg-white/5 p-3 rounded-xl border border-white/5">
                      <span className="text-xs font-bold text-gray-500 uppercase mr-2 flex items-center gap-2">
                        <Filter className="w-3 h-3" /> Active:
                      </span>
                      
                      {selectedLang && (
                        <button onClick={() => setSelectedLang(null)} className="group flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/50 hover:bg-purple-500/30 transition-colors">
                          <Code2 className="w-3 h-3" /> {selectedLang} <X className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                        </button>
                      )}
                      
                      {selectedPersona && (
                        <button onClick={() => setSelectedPersona(null)} className="group flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/50 hover:bg-blue-500/30 transition-colors">
                          <CheckCircle2 className="w-3 h-3" /> {personaConfig[selectedPersona]?.label} <X className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                        </button>
                      )}
                      
                      <div className="flex-1"></div>
                      <button onClick={() => { setSelectedLang(null); setSelectedPersona(null); }} className="text-xs font-bold text-red-400 hover:text-red-300 px-3 py-1.5 hover:bg-red-400/10 rounded-lg transition-colors">Clear All</button>
                    </div>
                  )}

                  {/* Tech Stack Filter (Simple Scroll) */}
                  <div className="relative group">
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        <div className="flex items-center gap-2 mr-2 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap px-2">
                           Stack:
                        </div>
                        {['Rust', 'TypeScript', 'Python', 'Go', 'C++', 'Java', 'Kotlin', 'Swift'].map(lang => (
                        <button
                            key={lang}
                            onClick={() => setSelectedLang(selectedLang === lang ? null : lang)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all whitespace-nowrap ${
                            selectedLang === lang
                                ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.2)]'
                                : 'bg-gray-800/50 text-gray-400 border-white/5 hover:border-white/20 hover:text-white hover:bg-gray-800'
                            }`}
                        >
                            {lang}
                        </button>
                        ))}
                    </div>
                  </div>

                  {/* ELEGANT PERSONA FILTER (Visible in Expert View) */}
                  {viewType === 'expert' && (
                    <div className="relative group animate-in slide-in-from-top-4 fade-in duration-500">
                        <div className={`absolute left-0 top-0 bottom-2 w-12 bg-gradient-to-r from-[#0B0C15] to-transparent z-10 pointer-events-none transition-opacity duration-300 ${showLeftArrow ? 'opacity-100' : 'opacity-0'}`} />
                        <div className={`absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-[#0B0C15] to-transparent z-10 pointer-events-none transition-opacity duration-300 ${showRightArrow ? 'opacity-100' : 'opacity-0'}`} />
                        
                        {showLeftArrow && (
                          <button 
                            onClick={() => scrollPersonas('left')}
                            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 p-1.5 rounded-full bg-gray-800/80 backdrop-blur-md border border-white/10 text-white shadow-lg hover:bg-gray-700 transition-all -ml-2"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                        )}
                        {showRightArrow && (
                          <button 
                            onClick={() => scrollPersonas('right')}
                            className="absolute right-0 top-1/2 -translate-y-1/2 z-20 p-1.5 rounded-full bg-gray-800/80 backdrop-blur-md border border-white/10 text-white shadow-lg hover:bg-gray-700 transition-all -mr-2"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        )}

                        <div 
                          ref={personaScrollRef}
                          className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide px-1 snap-x"
                          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }} 
                        >
                            <div className="flex items-center gap-2 mr-2 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap sticky left-0 z-0">
                                <Brain className="w-4 h-4 text-purple-400" /> Role:
                            </div>
                            
                            {Object.entries(personaConfig).map(([key, config]) => (
                            <button
                                key={key}
                                onClick={() => setSelectedPersona(selectedPersona === key ? null : key)}
                                className={`flex-shrink-0 snap-start flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all duration-300 ${
                                selectedPersona === key
                                    ? `${config.color.replace('bg-opacity-10', 'bg-opacity-20')} border-opacity-50 shadow-[0_0_15px_rgba(0,0,0,0.3)] scale-[1.02]`
                                    : 'bg-gray-800/30 text-gray-400 border-white/5 hover:border-white/20 hover:text-white hover:bg-gray-800/60'
                                }`}
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
                </div>
             </div>

            {isLoading ? (
                <div className="space-y-4">
                    <DevSkeleton /> <DevSkeleton /> <DevSkeleton />
                </div>
            ) : (
                <div className="space-y-4 animate-in fade-in duration-500">
                     {devs.length > 0 ? (
                        devs.map((dev, idx) => <DeveloperCard key={dev.id} dev={dev} index={idx} currentView={viewType} />)
                     ) : (
                        <div className="text-center py-20 bg-gray-900/20 rounded-2xl border border-white/5 border-dashed">
                             <Award className="w-12 h-12 mx-auto text-gray-600 mb-3 opacity-50" />
                             <p className="text-gray-500 font-medium">No developers found matching these filters.</p>
                             <button onClick={() => { setSelectedLang(null); setSelectedPersona(null); }} className="text-sm text-purple-400 hover:text-purple-300 mt-2 font-bold">Clear all filters</button>
                        </div>
                     )}
                </div>
            )}
        </main>
      </div>
    </div>
  );
}

export default DeveloperList;