import { useState, useEffect } from "react"
import { useParams, useNavigate, Link as RouterLink } from "react-router-dom"
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, PolarRadiusAxis
} from "recharts"
import {
  MapPin, Link as LinkIcon, Users, Star,
  Award, ArrowLeft, Code2, Calendar, ShieldCheck,
  TrendingUp, Trophy, Brain, Link, Cloud, Palette,
  Server, Shield, Database, Smartphone, Gamepad2, Cpu,
  Github, GitPullRequest, Terminal, Activity, Layers, Layout, CheckCircle2, Briefcase,
  Sigma, Zap, Crown, ArrowUpRight , Target 
} from "lucide-react"

// Language colors mapping (add more as needed)
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
  'C#': '#178600',
  Dart: '#00B4AB',
  Scala: '#c22d40',
  Elixir: '#6e4a7e',
  Haskell: '#5e5086',
  Lua: '#000080',
  R: '#198CE7',
  Shell: '#89e051',
};

// Level styling configuration
const levelStyles = {
  master: {
    color: 'text-purple-400',
    bg: 'bg-gradient-to-r from-purple-500/20 to-pink-500/20',
    border: 'border-purple-500/50',
    glow: 'shadow-[0_0_20px_rgba(168,85,247,0.3)]',
    icon: Crown,
    label: 'Master',
    description: 'Elite mastery with significant impact'
  },
  expert: {
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    glow: 'shadow-[0_0_15px_rgba(59,130,246,0.2)]',
    icon: Trophy,
    label: 'Expert',
    description: 'Deep knowledge and proven track record'
  },
  advanced: {
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    glow: '',
    icon: Target,
    label: 'Advanced',
    description: 'Strong proficiency with substantial work'
  },
  intermediate: {
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    glow: '',
    icon: Zap,
    label: 'Intermediate',
    description: 'Solid foundation and growing experience'
  },
  beginner: {
    color: 'text-gray-400',
    bg: 'bg-gray-500/10',
    border: 'border-gray-500/30',
    glow: '',
    icon: Code2,
    label: 'Beginner',
    description: 'Learning and building fundamentals'
  }
};

// --- CONFIG: All 19 Personas ---
const personaConfig: Record<string, { label: string; icon: any; color: string }> = {
  ai_whisperer: { label: 'AI Whisperer', icon: Brain, color: 'text-pink-400 border-pink-400 bg-pink-400/10' },
  ml_engineer: { label: 'ML Engineer', icon: Activity, color: 'text-rose-400 border-rose-400 bg-rose-400/10' },
  data_scientist: { label: 'Data Scientist', icon: Database, color: 'text-amber-400 border-amber-400 bg-amber-400/10' },
  computational_scientist: { label: 'Comp. Scientist', icon: Sigma, color: 'text-violet-400 border-violet-400 bg-violet-400/10' },
  data_engineer: { label: 'Data Engineer', icon: Server, color: 'text-orange-400 border-orange-400 bg-orange-400/10' },
  chain_architect: { label: 'Chain Architect', icon: Link, color: 'text-indigo-400 border-indigo-400 bg-indigo-400/10' },
  cloud_native: { label: 'Cloud Native', icon: Cloud, color: 'text-sky-400 border-sky-400 bg-sky-400/10' },
  devops_deamon: { label: 'DevOps Deamon', icon: Layers, color: 'text-slate-400 border-slate-400 bg-slate-400/10' },
  systems_architect: { label: 'Systems Architect', icon: Cpu, color: 'text-zinc-400 border-zinc-400 bg-zinc-400/10' },
  backend_behemoth: { label: 'Backend Behemoth', icon: Server, color: 'text-emerald-400 border-emerald-400 bg-emerald-400/10' },
  frontend_wizard: { label: 'Frontend Wizard', icon: Layout, color: 'text-purple-400 border-purple-400 bg-purple-400/10' },
  ux_engineer: { label: 'UX Engineer', icon: Palette, color: 'text-fuchsia-400 border-fuchsia-400 bg-fuchsia-400/10' },
  mobile_maestro: { label: 'Mobile Maestro', icon: Smartphone, color: 'text-blue-400 border-blue-400 bg-blue-400/10' },
  security_sentinel: { label: 'Security Sentinel', icon: Shield, color: 'text-red-400 border-red-400 bg-red-400/10' },
  game_guru: { label: 'Game Guru', icon: Gamepad2, color: 'text-lime-400 border-lime-400 bg-lime-400/10' },
  iot_tinkerer: { label: 'IoT Tinkerer', icon: Cpu, color: 'text-cyan-400 border-cyan-400 bg-cyan-400/10' },
  tooling_titan: { label: 'Tooling Titan', icon: Terminal, color: 'text-gray-400 border-gray-400 bg-gray-400/10' },
  algorithm_alchemist: { label: 'Algorithm Alchemist', icon: Code2, color: 'text-yellow-400 border-yellow-400 bg-yellow-400/10' },
  qa_automator: { label: 'QA Automator', icon: CheckCircle2, color: 'text-teal-400 border-teal-400 bg-teal-400/10' },
  enterprise_architect: { label: 'Enterprise Architect', icon: Briefcase, color: 'text-blue-300 border-blue-300 bg-blue-300/10' },
};

const API_BASE = "/api"

const formatNumber = (num: number) => {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return num?.toString() || '0';
};

function DeveloperDetail() {
  const { login } = useParams();
  const navigate = useNavigate();
  const [dev, setDev] = useState<any>(null);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const res = await fetch(`${API_BASE}/developers/${login}/details`);
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setDev(data);
      } catch (e) {
        navigate(-1);
      }
    };
    fetchDetails();
  }, [login, navigate]);

  if (!dev) return (
    <div className="min-h-screen bg-[#0B0C15] flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
    </div>
  );

  const rawPersonas = dev.personas || {};
  const sortedPersonas = Object.entries(rawPersonas).sort((a: any, b: any) => b[1] - a[1]);
  
  let displayKeys = sortedPersonas.filter(([, score]) => (score as number) > 0).map(([k]) => k);
  if (displayKeys.length < 3) {
      const remaining = Object.keys(personaConfig).filter(k => !displayKeys.includes(k));
      displayKeys = [...displayKeys, ...remaining.slice(0, 3 - displayKeys.length)];
  }
  const radarKeys = displayKeys.slice(0, 6);
  const personaData = radarKeys.map(key => ({
      subject: personaConfig[key]?.label || key,
      A: rawPersonas[key] || 0,
      fullMark: 100,
  }));

  const getExpertiseLevel = (score: number) => {
    if (score >= 90) return "Master";
    if (score >= 75) return "Expert";
    if (score >= 50) return "Specialist";
    if (score >= 25) return "Practitioner";
    return null; 
  };

  const allQualifyingPersonas = sortedPersonas
    .map(([key, score]) => ({ key, score: score as number, tier: getExpertiseLevel(score as number), config: personaConfig[key] }))
    .filter(p => p.tier && p.config); 

  const masters = allQualifyingPersonas.filter(p => p.score >= 90);
  const others = allQualifyingPersonas.filter(p => p.score < 90);

  // Helper component for language expertise card
  const LanguageExpertiseCard = ({ expertise }: { expertise: any }) => {
    const style = levelStyles[expertise.level as keyof typeof levelStyles];
    const LevelIcon = style.icon;
    const color = languageColors[expertise.language] || '#6366f1';


    return (
      <div 
        className={`relative overflow-hidden rounded-2xl border ${style.border} ${style.bg} ${style.glow} p-6 transition-all hover:scale-[1.02] group`}
      >
        {/* Background Decoration */}
        <div className="absolute top-0 right-0 w-32 h-32 opacity-5 pointer-events-none">
          <LevelIcon className="w-full h-full" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-4 relative z-10">
          <div className="flex items-center gap-3">
            <div 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            <h4 className="text-xl font-bold text-white">
              {expertise.language}
            </h4>
          </div>
          
          {expertise.is_primary && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/20 border border-yellow-500/40">
              <Crown className="w-3 h-3 text-yellow-400" />
              <span className="text-[10px] font-bold text-yellow-400 uppercase">Primary</span>
            </div>
          )}
        </div>

        {/* Level Badge */}
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${style.bg} border ${style.border} mb-4`}>
          <LevelIcon className={`w-4 h-4 ${style.color}`} />
          <span className={`text-sm font-bold ${style.color}`}>
            {style.label}
          </span>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-black/20 rounded-lg p-3">
            <div className="text-2xl font-bold text-white mb-1">
              {expertise.repos_count}
            </div>
            <div className="text-xs text-gray-400 uppercase font-bold">
              Repositories
            </div>
          </div>
          
          <div className="bg-black/20 rounded-lg p-3">
            <div className="text-2xl font-bold text-yellow-400 mb-1">
              {formatNumber(expertise.total_stars)}
            </div>
            <div className="text-xs text-gray-400 uppercase font-bold">
              Total Stars
            </div>
          </div>
        </div>

        {/* Largest Project */}
        <div className="bg-black/20 rounded-lg p-3 border-t border-white/5">
          <div className="text-xs text-gray-500 uppercase font-bold mb-1">
            Flagship Project
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-white truncate">
              {expertise.largest_project}
            </span>
            <span className="text-sm font-bold text-yellow-400 flex items-center gap-1">
              <Star className="w-3 h-3 fill-current" />
              {formatNumber(expertise.largest_project_stars)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // Helper Component for Repo Card
// Replace the RepoCard helper component in DeveloperDetail.tsx

  const RepoCard = ({ repo, badge, showOwner = false }: any) => {
    // Handle owner being string or object
    const ownerLogin = typeof repo.owner === 'object' ? repo.owner?.login : repo.owner;
    const repoName = repo.name;
    
    // Construct internal link if we have the necessary data
    const internalLink = repo.internal_repo_id && ownerLogin && repoName
      ? `/repo/${ownerLogin}/${repoName}?source=${repo.internal_table || 'repositories_index'}` 
      : null;
    
    // External GitHub link as fallback
    const externalLink = repo.url || repo.html_url || `https://github.com/${ownerLogin}/${repoName}`;
    
    const content = (
      <div className="flex flex-col h-full">
          <div className="flex justify-between items-start mb-2 pr-8">
              <h4 className="font-bold text-lg text-white group-hover:text-purple-300 truncate w-full">
                  {showOwner && ownerLogin ? <span className="opacity-60 font-normal">{ownerLogin} / </span> : ''}
                  {repoName}
              </h4>
          </div>
          <p className="text-gray-400 text-sm line-clamp-2 mb-4 flex-1">{repo.description}</p>
          <div className="flex items-center justify-between text-xs text-gray-500 mt-auto">
              <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-yellow-400 font-bold">
                    <Star className="w-3.5 h-3.5 fill-current"/> 
                    {repo.stars?.toLocaleString() || repo.stargazerCount?.toLocaleString() || 0}
                  </span>
                  {repo.language && <span>{repo.language}</span>}
              </div>
              {repo.internal_repo_id ? (
                <span className="flex items-center gap-1 text-purple-400 font-bold">
                  View Analysis <ArrowUpRight className="w-3 h-3"/>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-gray-500">
                  View on GitHub <ArrowUpRight className="w-3 h-3"/>
                </span>
              )}
          </div>
      </div>
    );

    const cardClasses = "group relative bg-gray-800/40 hover:bg-gray-800/60 border border-white/10 hover:border-purple-500/30 p-5 rounded-xl transition-all block h-full";
    const badgeEl = badge && (
      <div className="absolute top-2 right-2 z-10">
        <span className="text-[9px] uppercase font-bold bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30">
          {badge}
        </span>
      </div>
    );

    // Use internal link if available, otherwise fallback to GitHub
    if (internalLink) {
      return (
        <RouterLink to={internalLink} className={cardClasses}>
          {badgeEl}
          {content}
        </RouterLink>
      );
    }

    return (
      <a href={externalLink} target="_blank" rel="noreferrer" className={cardClasses}>
        {badgeEl}
        {content}
      </a>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0C15] text-white pb-20">
      <div className="max-w-[1200px] mx-auto px-6 pt-8">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 hover:text-white transition mb-8 group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT COLUMN: Identity & Stats */}
          <div className="space-y-6">
            <div className="bg-gray-900/40 backdrop-blur-md rounded-3xl p-8 border border-white/5 text-center relative overflow-hidden">
              
              {/* Avatar */}
              <div className="relative inline-block mb-6">
                <div className="absolute inset-0 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full blur-lg opacity-40"></div>
                <img src={dev.avatar_url} className="w-32 h-32 rounded-full border-4 border-gray-800 relative z-10" />
                {dev.is_rising_star && (
                  <div className="absolute bottom-0 right-0 bg-gradient-to-r from-orange-500 to-red-500 p-2 rounded-full border-4 border-gray-800 z-20">
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                )}
              </div>

              {/* Name & GitHub Link */}
              <h1 className="text-3xl font-bold mb-1 text-white">{dev.name}</h1>
              <a 
                href={`https://github.com/${dev.login}`} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-purple-400 hover:text-purple-300 font-medium mb-4 inline-flex items-center gap-1 transition-colors"
              >
                @{dev.login} <Github className="w-3 h-3" />
              </a>

              {/* Bio */}
              {dev.bio && (
                <p className="text-gray-300 text-sm mb-6 leading-relaxed border-t border-white/5 pt-4 font-light">
                  {dev.bio}
                </p>
              )}

              {/* Badges */}
              <div className="flex flex-wrap justify-center gap-2 mb-8">
                {dev.is_organization ? (
                   <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-500/10 border border-purple-500/20 text-purple-400">
                     <Users className="w-3 h-3" /> Organization
                   </span>
                ) : dev.badges?.map((b: any, i: number) => (
                  <span key={i} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/5 border border-white/10 text-white">
                    <ShieldCheck className="w-3 h-3 text-purple-400" /> {b.type}
                  </span>
                ))}
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-400">{dev.total_stars_earned?.toLocaleString() || 0}</div>
                  <div className="text-xs text-gray-500 uppercase font-bold tracking-wider">Impact</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-400">{dev.followers_count?.toLocaleString() || 0}</div>
                  <div className="text-xs text-gray-500 uppercase font-bold tracking-wider">Followers</div>
                </div>
              </div>
            </div>

            {/* Current Focus (Pulse) */}
            {dev.current_work?.status !== 'dormant' && dev.current_work?.repos?.length > 0 && (
              <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 rounded-2xl p-6 border border-white/10 relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-2 opacity-10"><Zap className="w-24 h-24 text-blue-400"/></div>
                 <h3 className="text-xs font-bold text-blue-300 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Zap className="w-4 h-4 animate-pulse" /> Current Focus (90d)
                 </h3>
                 <div className="space-y-3 relative z-10">
                    {dev.current_work.repos.map((repo: any) => (
                        <div key={repo.url} className="block">
                             <RepoCard repo={repo} />
                        </div>
                    ))}
                 </div>
                 {dev.current_work.status === 'multi_tasking' && (
                     <div className="mt-3 text-center text-[10px] text-gray-500 uppercase font-bold tracking-wider relative z-10">Multi-Tasking</div>
                 )}
              </div>
            )}

            {/* Context & Contact Card */}
            <div className="bg-gray-900/40 rounded-2xl p-6 border border-white/5 space-y-4 text-sm text-gray-300">
              {dev.company && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-400">
                    <Briefcase className="w-4 h-4" />
                  </div>
                  <span>{dev.company}</span>
                </div>
              )}
              
              {dev.location && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-400">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <span>{dev.location}</span>
                </div>
              )}
              
              {dev.blog_url && (
                <a 
                  href={dev.blog_url.startsWith('http') ? dev.blog_url : `https://${dev.blog_url}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex items-center gap-3 group hover:text-white transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-400 group-hover:text-purple-400 group-hover:bg-purple-500/10 transition-colors">
                    <LinkIcon className="w-4 h-4" />
                  </div>
                  <span className="truncate underline decoration-white/10 group-hover:decoration-purple-400/50 underline-offset-2">
                    {dev.blog_url.replace(/^https?:\/\//, '')}
                  </span>
                </a>
              )}

                {/* Smart Time Active Display */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-400">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <span>
                    {(() => {
                      const createdDate = new Date(dev.created_at);
                      const now = new Date();
                      const diffMs = now.getTime() - createdDate.getTime();
                      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                      const months = Math.floor(days / 30);
                      const years = Math.floor(days / 365);
                      
                      if (years > 0) return `${years} Year${years > 1 ? 's' : ''} Active`;
                      if (months > 0) return `${months} Month${months > 1 ? 's' : ''} Active`;
                      return `${days} Day${days > 1 ? 's' : ''} Active`;
                    })()}
                  </span>
                </div>
            </div>

          </div>

          {/* RIGHT COLUMN */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* DNA / SKILLS SECTION */}
            <div className="bg-gray-900/40 backdrop-blur-md rounded-3xl border border-white/5 p-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-purple-400" /> Developer DNA
                </h3>
              </div>

              {/* MASTERS */}
              {masters.length > 0 ? (
                <div className="flex flex-wrap gap-3 mb-6">
                  {masters.map((p) => (
                    <div key={p.key} className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold border shadow-[0_0_15px_rgba(0,0,0,0.3)] ${p.config.color}`}>
                      <p.config.icon className="w-3.5 h-3.5" />
                      {p.config.label} Master
                    </div>
                  ))}
                </div>
              ) : allQualifyingPersonas.length === 0 && (
                <div className="flex gap-2 mb-6">
                  <span className="text-xs font-bold bg-white/5 text-gray-400 px-3 py-1 rounded-full">Generalist / Explorer</span>
                </div>
              )}

              {/* RADAR CHART or ALTERNATIVE */}
              {radarKeys.length >= 3 ? (
                <div className="h-[300px] w-full mb-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={personaData}>
                      <PolarGrid stroke="#ffffff20" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 600 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name="Skills" dataKey="A" stroke="#a855f7" strokeWidth={3} fill="#a855f7" fillOpacity={0.4} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              ) : allQualifyingPersonas.length > 0 ? (
                /* Alternative: Horizontal Bars for <3 personas */
                <div className="space-y-4 mb-6">
                  {allQualifyingPersonas.slice(0, 3).map((p) => (
                    <div key={p.key} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <p.config.icon className={`w-4 h-4 ${p.config.color.split(' ')[0]}`} />
                          <span className="text-sm font-bold text-gray-300">{p.config.label}</span>
                        </div>
                        <span className="text-sm font-bold text-gray-400">{p.score}/100</span>
                      </div>
                      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${p.config.color.replace('text-', 'bg-').split(' ')[0]} transition-all duration-500`}
                          style={{ width: `${p.score}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-gray-500 mb-6">
                  <div className="text-center">
                    <Code2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Building their developer profile...</p>
                  </div>
                </div>
              )}

              {/* OTHERS */}
              {others.length > 0 && (
                <div className="pt-6 border-t border-white/5">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Additional Skills</h4>
                    <div className="flex flex-wrap gap-2">
                        {others.map((p) => (
                            <div key={p.key} className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border bg-opacity-5 ${p.config.color.replace('bg-opacity-10', 'bg-opacity-5')}`}>
                                <p.config.icon className="w-3 h-3 opacity-70" />
                                {p.config.label}
                                <span className="opacity-50 text-[10px] ml-1 uppercase tracking-tight">{p.tier}</span>
                            </div>
                        ))}
                    </div>
                </div>
              )}
            </div>


            {dev.language_expertise?.expertise && dev.language_expertise.expertise.length > 0 && (
              <>
                {/* LANGUAGE EXPERTISE SECTION */}
                <div className="bg-gray-900/40 backdrop-blur-md rounded-3xl border border-white/5 p-8">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-2xl font-bold flex items-center gap-3 mb-2">
                        <Code2 className="w-6 h-6 text-purple-400" /> 
                        Language Mastery
                      </h3>
                      {dev.language_expertise.expertise.filter((e: any) => ['master', 'expert'].includes(e.level)).length > 0 && <p className="text-sm text-gray-400">
                        Expert in {dev.language_expertise.expertise.filter((e: any) => ['master', 'expert'].includes(e.level)).length} languages
                      </p>
                      }
                    </div>
                    
                    {/* Polyglot Score */}
                    <div className="text-center">
                      <div className="text-3xl font-bold bg-gradient-to-br from-purple-400 to-pink-400 bg-clip-text text-transparent mb-1">
                        {dev.language_expertise.polyglot_score}
                      </div>
                      <div className="text-xs text-gray-500 uppercase font-bold">
                        Polyglot Score
                      </div>
                    </div>
                  </div>

                  {/* Expertise Cards Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                    {dev.language_expertise.expertise.slice(0, 6).map((exp: any) => (
                      <LanguageExpertiseCard key={exp.language} expertise={exp} />
                    ))}
                  </div>

                  {/* Show More Button */}
                  {dev.language_expertise.expertise.length > 6 && (
                    <button className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-gray-400 hover:text-white transition-colors">
                      Show {dev.language_expertise.expertise.length - 6} More Languages
                    </button>
                  )}
                </div>

                {/* FAVORITE LANGUAGES MINI SECTION */}
                <div className="bg-gradient-to-br from-purple-900/20 to-pink-900/20 rounded-2xl p-6 border border-white/10">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Award className="w-4 h-4 text-purple-400" />
                    Favorite Languages
                  </h3>
                  
                  <div className="space-y-3">
                    {dev.language_expertise.favorites.map((lang: string, idx: number) => {
                      const color = languageColors[lang] || '#6366f1';
                      const expertise = dev.language_expertise.expertise.find((e: any) => e.language === lang);
                      

                      return (
                        <div 
                          key={lang}
                          className="flex items-center gap-4 p-3 bg-black/20 rounded-xl border border-white/5 hover:border-purple-500/30 transition-colors group"
                        >
                          {/* Rank Badge */}
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                            idx === 0 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40' :
                            idx === 1 ? 'bg-gray-400/20 text-gray-300 border border-gray-400/40' :
                            'bg-orange-700/20 text-orange-400 border border-orange-700/40'
                          }`}>
                            #{idx + 1}
                          </div>

                          {/* Language Info */}
                          <div 
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-white group-hover:text-purple-300 transition-colors">
                              {lang}
                            </div>
                            <div className="text-xs text-gray-500">
                              {expertise?.repos_count || 0} repos • {formatNumber(expertise?.total_stars || 0)} stars
                            </div>
                          </div>

                          {/* Level Badge */}
                          {expertise && (
                            <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                              levelStyles[expertise.level as keyof typeof levelStyles].color
                            } ${levelStyles[expertise.level as keyof typeof levelStyles].bg} border ${
                              levelStyles[expertise.level as keyof typeof levelStyles].border
                            }`}>
                              {levelStyles[expertise.level as keyof typeof levelStyles].label}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* 2. PRIMARY WORK (Magnum Opus) */}
            {dev.primary_work?.repos?.length > 0 && (
                <div>
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <Crown className="w-5 h-5 text-yellow-500" /> Magnum Opus
                        {dev.primary_work.status === 'dual_wielding' && <span className="text-xs bg-yellow-500/10 text-yellow-500 px-2 py-1 rounded uppercase ml-2">Dual Major</span>}
                    </h3>
                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                        {dev.primary_work.repos.map((repo: any) => (
                            <RepoCard key={repo.name} repo={repo} badge="Primary" />
                        ))}
                    </div>
                </div>
            )}

            {/* 3. TROPHY CASE (Top Repos) */}
            <div>
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><Trophy className="w-5 h-5 text-purple-400" /> Top Repositories</h3>
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {dev.top_repos?.map((repo: any) => <RepoCard key={repo.name} repo={repo} />)}
              </div>
            </div>

            {/* 4. CONTRIBUTIONS */}
            {dev.contributed_repos && dev.contributed_repos.length > 0 && (
              <div>
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><GitPullRequest className="w-5 h-5 text-blue-400" /> Major Contributions</h3>
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                  {dev.contributed_repos.map((repo: any) => <RepoCard key={repo.name} repo={repo} badge="Contributor" showOwner={true} />)}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}

export default DeveloperDetail