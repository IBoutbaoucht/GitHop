import { useState, useEffect } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { API_BASE } from './config'
import {
  Star,
  GitFork,
  Activity,
  Eye,
  AlertCircle,
  ExternalLink,
  Code,
  Users,
  ArrowLeft,
  GitCommit,
  Tag,
  Globe,
  Code2,
  Trophy,
  Medal,
  Crown,
  LayoutTemplate,
  MessageSquare,
  Book,
  Scale,
  Database,
  Zap,
  Flame,
  Coffee,
  TrendingUp,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Sparkles // NEW: Added Sparkles icon for AI
} from "lucide-react"
import {
  AreaChart,
  Area,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts"

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css'; // Import the code style you want
import rehypeRaw from "rehype-raw"


// CSS for the markdown look and code highlighting
import 'highlight.js/styles/github-dark.css';
import 'github-markdown-css/github-markdown.css';

// --- Interfaces ---

interface Repository {
  id: number
  github_id: number
  name: string
  full_name: string
  owner_login: string
  owner_avatar_url?: string;
  description?: string
  html_url: string
  homepage_url?: string
  stars_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  language?: string
  topics?: string[]
  license_name?: string
  created_at: string
  pushed_at?: string

  // Extended Metrics
  size_kb?: number;
  is_template?: boolean;
  is_archived: boolean;
  is_fork: boolean;
  has_issues: boolean;
  has_wiki: boolean;
  has_pages: boolean;
  has_discussions: boolean;

  // Analysis Data
  health_score?: number;
  activity_score?: number;
  days_since_last_commit?: number;
  commits_last_year?: number;
  latest_release_tag?: string;
  total_releases?: number;
  readme_snippet?: string; // Add this field
}

interface RepositoryLanguage {
  language_name: string;
  bytes_count: number;
  percentage: number;
}

interface Contributor {
  login: string;
  avatar_url: string;
  contributions: number;
  html_url: string;
  type: string;
}

interface CommitActivity {
  week: string;
  total: number;
}

interface Commit {
  sha: string;
  commit_message: string;
  author_name: string;
  author_email: string;
  author_login: string | null;
  author_avatar_url: string | null;
  committer_name: string;
  committer_date: string;
  additions: number;
  deletions: number;
  total_changes: number;
  files_changed: number;
  html_url: string;
  fetched_at: string;
}

interface DetailedRepo extends Repository {
  languages?: RepositoryLanguage[];
  contributors?: Contributor[];
  commit_activity?: CommitActivity[];
  contributors_data_type?: 'all_time' | 'recent';
}

// --- Constants & Helpers ---

// Simple Readme Component
function ReadmeViewer({ readmeContent }: { readmeContent: string | undefined }) {
  if (!readmeContent || readmeContent === 'NO_README_FOUND') return null;

  return (
    <div className="bg-gray-900/40 backdrop-blur-md rounded-2xl border border-white/5 p-6 overflow-hidden">
      <div className="markdown-body dark !bg-transparent !text-gray-300">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[
            rehypeRaw,        // <---- ENABLE HTML RENDERING
            rehypeHighlight,  // <---- syntax highlighting AFTER html parsing
          ]}
        >
          {readmeContent}
        </ReactMarkdown>
      </div>
    </div>
  );
}


const languageColors: Record<string, string> = {
  JavaScript: "#f1e05a", TypeScript: "#3178c6", Python: "#3572A5", Java: "#b07219",
  Go: "#00ADD8", Rust: "#dea584", "C++": "#f34b7d", C: "#555555", PHP: "#4F5D95",
  Ruby: "#701516", Swift: "#F05138", Kotlin: "#A97BFF", "C#": "#178600",
  HTML: "#e34c26", CSS: "#563d7c", Shell: "#89e051", Dart: "#00B4AB",
}

// Helper to Calculate Project Vitality (Context Aware)
const getProjectVitality = (repo: DetailedRepo) => {
  const now = new Date().getTime();
  const created = new Date(repo.created_at).getTime();
  const ageInDays = Math.max(1, Math.floor((now - created) / (1000 * 60 * 60 * 24)));
  const isNew = ageInDays <= 30;

  // Work Rate Logic
  let workRateLabel = "";
  let workRateValue = "";
  let WorkIcon = Activity;
  const commits = repo.commits_last_year || 0;

  if (isNew) {
    // For new repos, assume commits_last_year is total commits
    const commitsPerDay = (commits / ageInDays).toFixed(1);
    workRateLabel = "Sprint Speed";
    workRateValue = `${commitsPerDay} commits / day`;
    WorkIcon = Zap;
  } else {
    const commitsPerWeek = (commits / 52).toFixed(0);
    workRateLabel = "Commit Rhythm";
    workRateValue = `~${commitsPerWeek} commits / week`;
    WorkIcon = GitCommit;
  }

  // Maintenance Status Logic
  let statusLabel = "";
  let statusColor = "";
  let StatusIcon = Activity;
  const lastCommit = repo.days_since_last_commit;

  if (lastCommit === null || lastCommit === undefined) {
    statusLabel = "Unknown State";
    statusColor = "text-gray-400 bg-gray-400/10 border-gray-400/20";
  } else if (lastCommit <= 3) {
    statusLabel = "Currently Coding";
    statusColor = "text-emerald-400 bg-emerald-400/10 border-emerald-400/20";
    StatusIcon = Flame;
  } else if (lastCommit <= 14) {
    statusLabel = "Actively Maintained";
    statusColor = "text-blue-400 bg-blue-400/10 border-blue-400/20";
    StatusIcon = Activity;
  } else if (lastCommit <= 60) {
    statusLabel = "Resting";
    statusColor = "text-yellow-400 bg-yellow-400/10 border-yellow-400/20";
    StatusIcon = Coffee;
  } else {
    statusLabel = "Dormant";
    statusColor = "text-red-400 bg-red-400/10 border-red-400/20";
    StatusIcon = AlertCircle;
  }

  // Star Velocity
  const starVelocity = (repo.stars_count / ageInDays).toFixed(1);
  const hypeLabel = isNew ? "Viral Factor" : "Popularity Growth";

  return {
    isNew,
    ageInDays,
    workRateLabel,
    workRateValue,
    WorkIcon,
    statusLabel,
    statusColor,
    StatusIcon,
    starVelocity,
    hypeLabel
  };
};

function RepositoryDetail() {
  const { owner, name } = useParams<{ owner: string; name: string }>()
  const [searchParams] = useSearchParams();
  const navigate = useNavigate()

  const [repo, setRepo] = useState<DetailedRepo | null>(null)
  const [commits, setCommits] = useState<Commit[]>([])
  const [repoRank, setRepoRank] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDescExpanded, setIsDescExpanded] = useState(false);

  // NEW: AI Summary States
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  const initialSource = searchParams.get('source');

  useEffect(() => {
    loadRepoDetails()
  }, [owner, name])

  const loadRepoDetails = async () => {
    setIsLoading(true)
    try {
      const fullName = `${owner}/${name}`
      const searchResponse = await fetch(`${API_BASE}/repos/search?full_name=${encodeURIComponent(fullName)}`)

      if (!searchResponse.ok) {
        navigate(-1)
        return
      }

      const searchData = await searchResponse.json()
      const sourceTable = searchData.source_table || initialSource || 'tops';

      const response = await fetch(`${API_BASE}/repos/${searchData.id}/details?source=${sourceTable}`)
      const detailData = await response.json()

      let contributors: Contributor[] = []
      try {
        const contributorsResponse = await fetch(`${API_BASE}/repos/${searchData.id}/contributors?source=${sourceTable}`)
        if (contributorsResponse.ok) contributors = await contributorsResponse.json()
      } catch (error) { console.error(error) }

      let commitActivity: CommitActivity[] = []
      try {
        const activityResponse = await fetch(`${API_BASE}/repos/${searchData.id}/commit-activity?source=${sourceTable}`)
        if (activityResponse.ok) {
          const activityData = await activityResponse.json()
          commitActivity = activityData.slice(-52).map((week: any) => ({
            week: new Date(week.week_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            total: week.total_commits || 0
          }))
        }
      } catch (error) { console.error(error) }

      let recentCommits: Commit[] = [];
      try {
        const commitsResponse = await fetch(`${API_BASE}/repos/${searchData.id}/commits?limit=15&source=${sourceTable}`);
        if (commitsResponse.ok) recentCommits = await commitsResponse.json();
      } catch (error) { console.error(error) }

      setCommits(recentCommits);
      setRepo({
        ...detailData,
        contributors: contributors.length > 0 ? contributors : undefined,
        commit_activity: commitActivity.length > 0 ? commitActivity : undefined,
      })

      if (searchData.id) fetchRepoRank(searchData.id, sourceTable);
    } catch (error) {
      console.error("Error loading repo details:", error)
      navigate(-1)
    } finally {
      setIsLoading(false)
    }
  }

  // --- NEW: Handle AI Summary ---
  const handleSummarize = async () => {
    if (!repo?.readme_snippet) return;

    setIsSummarizing(true);
    try {
      const res = await fetch(`${API_BASE}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: repo.readme_snippet })
      });
      const data = await res.json();
      setAiSummary(data.summary);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSummarizing(false);
    }
  };

  const fetchRepoRank = async (repoId: number, sourceTable: string) => {
    try {
      let endpoint = `${API_BASE}/repos/top?limit=300`;
      if (sourceTable === 'growings') endpoint = `${API_BASE}/growings-database`;
      if (sourceTable === 'trendings') endpoint = `${API_BASE}/trendings-database`;

      const response = await fetch(endpoint);
      const data = await response.json();
      const list = data.data || [];
      const rank = list.findIndex((r: any) => r.id === repoId);
      if (rank !== -1) setRepoRank(rank + 1);
    } catch (error) { console.error(error) }
  };

  // --- Format Helpers ---

  const formatNumber = (num: any) => {
    if (!num) return "0"
    const val = typeof num === "string" ? parseInt(num) : num
    if (val >= 1000000) return (val/1000000).toFixed(1).replace(/\.0$/, "") + "M"
    if (val >= 1000) return (val/1000).toFixed(1).replace(/\.0$/, "") + "K"
    return val.toString()
  }

  const formatSize = (kb: number = 0) => {
    if (kb > 1024 * 1024) return `${(kb / (1024 * 1024)).toFixed(1)} GB`;
    if (kb > 1024) return `${(kb / 1024).toFixed(1)} MB`;
    return `${kb} KB`;
  };

  const formatDate = (d: any) => d ? new Date(d).toLocaleDateString("en-US", {year: "numeric", month: "short", day: "numeric"}) : "N/A"

  const formatTimeAgo = (dateString: string): string => {
    const now = new Date().getTime();
    const date = new Date(dateString).getTime();
    const diffMs = now - date;
    const minutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  const truncateMessage = (msg: string, len = 270) => {
    const line = msg.split('\n')[0];
    return line.length <= len ? line : line.substring(0, len) + '...'
  }

  const getCommitTypeStyle = (message: string) => {
    const msg = message.toLowerCase();
    if (msg.startsWith('feat') || msg.startsWith('feature')) return { color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20', label: 'Feature' };
    if (msg.startsWith('fix')) return { color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20', label: 'Fix' };
    if (msg.startsWith('docs')) return { color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20', label: 'Docs' };
    if (msg.startsWith('refactor')) return { color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/20', label: 'Refactor' };
    if (msg.startsWith('test')) return { color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20', label: 'Test' };
    return { color: 'text-gray-400', bg: 'bg-gray-400/10', border: 'border-gray-400/20', label: 'Commit' };
  };

  const getActivityLevel = (days?: number | null) => {
    if (days === null || days === undefined) return { label: "Unknown", color: "text-gray-400" }
    if (days <= 7) return { label: "Very Active", color: "text-green-400" }
    if (days <= 30) return { label: "Active", color: "text-blue-400" }
    if (days <= 90) return { label: "Moderate", color: "text-yellow-400" }
    if (days <= 365) return { label: "Low Activity", color: "text-orange-400" }
    return { label: "Inactive", color: "text-red-400" }
  }

  // --- Render ---

  if (isLoading) return <div className="min-h-screen bg-[#0B0C15] flex items-center justify-center"><div className="w-12 h-12 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div></div>
  if (!repo) return null;

  const activity = getActivityLevel(repo.days_since_last_commit)
  const topContributors = repo.contributors?.slice(0, 3) || [];
  const otherContributors = repo.contributors?.slice(3) || [];

  // Calculate Project Vitality
  const vitality = getProjectVitality(repo);

  // --- Determine Chart Data Range ---
  // If the project is new (<30 days), slicing the last 4 weeks gives a better "Last Month" view
  // otherwise we show the full year.
  const chartData = vitality.isNew && repo.commit_activity
    ? repo.commit_activity.slice(-4)
    : repo.commit_activity;

  return (
    <div className="min-h-screen bg-[#0B0C15] text-white selection:bg-purple-500/30 pb-20">

      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-pink-600/10 rounded-full blur-[120px]"></div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0B0C15]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="group flex items-center gap-2 text-gray-400 hover:text-white transition">
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </div>
            <span className="text-sm font-medium uppercase tracking-wider">Back</span>
          </button>
          <div className="flex items-center gap-2 font-bold tracking-tight">Git<span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Hop</span></div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8 relative z-10">

        {/* HERO CARD */}
        <div className="relative overflow-hidden bg-gray-900/40 backdrop-blur-md rounded-3xl border border-white/10 p-8 mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
            <div className="flex items-center gap-6">
              {repoRank && (
                <div className="hidden sm:flex flex-col items-center justify-center w-20 h-20 bg-gray-800 rounded-2xl border border-gray-700 shadow-xl">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Rank</span>
                  <span className="text-3xl font-bold bg-gradient-to-br from-purple-400 to-pink-400 bg-clip-text text-transparent">#{repoRank}</span>
                </div>
              )}
              <div className="flex items-center gap-4">
                <img src={repo.owner_avatar_url || "/placeholder.svg"} alt={repo.owner_login} className="w-16 h-16 rounded-full border-2 border-gray-700" />
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">{repo.name}</h1>
                    {repo.is_archived && <span className="px-3 py-1 bg-orange-900/30 border border-orange-500/30 text-orange-300 text-xs uppercase font-bold rounded-full">Archived</span>}
                    {repo.is_template && <span className="px-3 py-1 bg-blue-900/30 border border-blue-500/30 text-blue-300 text-xs uppercase font-bold rounded-full flex items-center gap-1"><LayoutTemplate className="w-3 h-3" /> Template</span>}
                  </div>
                  <p className="text-lg text-gray-400 flex items-center gap-2"><span className="text-purple-400">@</span> {repo.owner_login}</p>
                </div>
              </div>
            </div>
            <div className="flex gap-4 w-full md:w-auto">
              <a href={repo.html_url} target="_blank" rel="noopener noreferrer" className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white text-black hover:bg-gray-200 px-6 py-3 rounded-xl font-bold shadow-lg transition-all">
                <ExternalLink className="w-4 h-4" /> GitHub
              </a>
            </div>
          </div>

          {/* Description with Show More */}
          <div className="mt-8 max-w-3xl">
            <p className="text-xl text-gray-300 leading-relaxed font-light">
              {isDescExpanded || !repo.description || repo.description.length <= 180
                ? repo.description
                : `${repo.description.substring(0, 180)}...`}
            </p>

            {repo.description && repo.description.length > 180 && (
              <button
                onClick={() => setIsDescExpanded(!isDescExpanded)}
                className="mt-3 text-sm font-bold text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
              >
                {isDescExpanded ? (
                  <>Show Less <ChevronUp className="w-4 h-4" /></>
                ) : (
                  <>Read More <ChevronDown className="w-4 h-4" /></>
                )}
              </button>
            )}

            {/* --- NEW: AI Summary Section --- */}
             <div className="mt-6">
               {!aiSummary ? (
                 <button
                   onClick={handleSummarize}
                   disabled={isSummarizing || !repo.readme_snippet}
                   className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg text-sm font-bold text-white shadow-lg hover:shadow-purple-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   <Sparkles className={`w-4 h-4 ${isSummarizing ? 'animate-spin' : ''}`} />
                   {isSummarizing ? 'Generating Summary...' : 'Summarize with AI'}
                 </button>
               ) : (
                 <div className="bg-purple-900/20 border border-purple-500/30 rounded-xl p-4 animate-in fade-in slide-in-from-bottom-2">
                   <div className="flex items-center gap-2 mb-2 text-purple-300 text-xs font-bold uppercase tracking-wider">
                     <Sparkles className="w-3 h-3" /> AI Summary
                   </div>
                   <p className="text-purple-100 font-medium leading-relaxed">
                     {aiSummary}
                   </p>
                 </div>
               )}
             </div>
          </div>

          {/* QUICK LINKS ROW */}
          <div className="mt-8 flex flex-wrap items-center gap-4 pt-6 border-t border-white/5">
            {repo.homepage_url && (
              <a href={repo.homepage_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-purple-500/10 border border-white/10 hover:border-purple-500/30 rounded-lg transition text-sm font-medium text-gray-300 hover:text-white">
                <Globe className="w-4 h-4 text-purple-400" /> Website
              </a>
            )}
            {repo.has_wiki && (
              <a href={`${repo.html_url}/wiki`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-purple-500/10 border border-white/10 hover:border-purple-500/30 rounded-lg transition text-sm font-medium text-gray-300 hover:text-white">
                <Book className="w-4 h-4 text-purple-400" /> Wiki
              </a>
            )}
            {repo.has_discussions && (
              <a href={`${repo.html_url}/discussions`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-purple-500/10 border border-white/10 hover:border-purple-500/30 rounded-lg transition text-sm font-medium text-gray-300 hover:text-white">
                <MessageSquare className="w-4 h-4 text-purple-400" /> Discussions
              </a>
            )}
            {repo.license_name && (
               <div className="flex items-center gap-2 px-4 py-2 bg-transparent border border-white/5 rounded-lg text-sm font-medium text-gray-400 cursor-default">
                 <Scale className="w-4 h-4" /> {repo.license_name}
               </div>
            )}
          </div>
        </div>

        {/* 2-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* LEFT COLUMN: Community & Code */}
          <div className="lg:col-span-2 space-y-8">

              <ReadmeViewer readmeContent={repo.readme_snippet} />

            {/* 1. CONTRIBUTORS */}
            {repo.contributors && repo.contributors.length > 0 && (
              <div className="bg-gray-900/40 backdrop-blur-md rounded-2xl border border-white/5 p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                  <Users className="w-40 h-40" />
                </div>

                <div className="flex items-center justify-between mb-8 relative z-10">
                  <div>
                    <h3 className="text-2xl font-bold flex items-center gap-3 text-white">
                      <Crown className="w-6 h-6 text-yellow-500" />
                      Community Leaders
                    </h3>
                    {/* <p className="text-gray-400 mt-1">
                      {repo.contributors.length} contributors driving this project forward.
                    </p> */}
                    <p className="text-gray-400 mt-1">The people driving this project forward.</p>

                    {/* NEW: Transparency Badge */}
                      {repo.contributors_data_type === 'recent' && (
                        <span className="text-[10px] uppercase font-bold bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded border border-orange-500/20 flex items-center gap-1" title="List includes only active contributors from recent history">
                          <AlertCircle className="w-3 h-3" /> Based On Recent Contributors Only
                        </span>
                      )}
                      {repo.contributors_data_type === 'all_time' && (
                        <span className="text-[10px] uppercase font-bold bg-green-500/10 text-green-400 px-2 py-0.5 rounded border border-green-500/20" title="List includes all contributors since project creation">
                          All Time
                        </span>
                      )}
                  </div>
                  <div className="text-xs font-bold text-purple-400 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20">
                     + {repo.contributors.length} Contributors
                  </div>
                </div>

                {/* The Podium (Top 3) */}
                <div className="flex flex-wrap items-end justify-center gap-4 sm:gap-8 mb-10 relative z-10 border-b border-white/5 pb-10">
                  {/* 2nd Place */}
                  {topContributors[1] && (
                    <a href={topContributors[1].html_url} target="_blank" className="group flex flex-col items-center order-1">
                       <div className="relative mb-3">
                         <img src={topContributors[1].avatar_url} className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 border-gray-400 shadow-lg shadow-gray-500/20 group-hover:scale-105 transition-transform" />
                         <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-gray-400 text-gray-900 text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                           <Medal className="w-3 h-3" /> #2
                         </div>
                       </div>
                       <div className="text-center mt-2">
                         <div className="font-bold text-gray-300 group-hover:text-white">{topContributors[1].login}</div>
                         <div className="text-xs text-gray-500">{topContributors[1].contributions} commits</div>
                       </div>
                    </a>
                  )}

                  {/* 1st Place */}
                  {topContributors[0] && (
                    <a href={topContributors[0].html_url} target="_blank" className="group flex flex-col items-center order-2 -mt-6">
                       <div className="relative mb-4">
                         <Crown className="absolute -top-8 left-1/2 -translate-x-1/2 w-8 h-8 text-yellow-500 animate-bounce" />
                         <img src={topContributors[0].avatar_url} className="w-20 h-20 sm:w-28 sm:h-28 rounded-full border-4 border-yellow-500 shadow-2xl shadow-yellow-500/30 group-hover:scale-105 transition-transform" />
                         <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-yellow-500 text-black text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                           <Trophy className="w-3 h-3" /> #1
                         </div>
                       </div>
                       <div className="text-center mt-2">
                         <div className="text-lg font-bold text-yellow-500 group-hover:text-yellow-400">{topContributors[0].login}</div>
                         <div className="text-sm text-gray-400">{topContributors[0].contributions} commits</div>
                       </div>
                    </a>
                  )}

                  {/* 3rd Place */}
                  {topContributors[2] && (
                    <a href={topContributors[2].html_url} target="_blank" className="group flex flex-col items-center order-3">
                       <div className="relative mb-3">
                         <img src={topContributors[2].avatar_url} className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 border-orange-700 shadow-lg shadow-orange-900/40 group-hover:scale-105 transition-transform" />
                         <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-orange-700 text-orange-100 text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                           <Medal className="w-3 h-3" /> #3
                         </div>
                       </div>
                       <div className="text-center mt-2">
                         <div className="font-bold text-gray-400 group-hover:text-white">{topContributors[2].login}</div>
                         <div className="text-xs text-gray-500">{topContributors[2].contributions} commits</div>
                       </div>
                    </a>
                  )}
                </div>

                {/* The Rest (Grid) */}
                <div className="relative z-10">
                  <h4 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Active Contributors</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {otherContributors.slice(0, 12).map((c) => (
                      <a key={c.login} href={c.html_url} target="_blank" className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-purple-500/30 transition-all group">
                        <img src={c.avatar_url} className="w-10 h-10 rounded-full border border-gray-600 group-hover:border-purple-500 transition-colors" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-300 truncate group-hover:text-white">{c.login}</div>
                          <div className="text-xs text-gray-500">{c.contributions} commits</div>
                        </div>
                      </a>
                    ))}
                  </div>
                  {otherContributors.length > 12 && (
                     <div className="mt-4 text-center">
                        <a href={`${repo.html_url}/graphs/contributors`} target="_blank" className="text-sm text-purple-400 hover:text-purple-300 font-medium">
                          + {otherContributors.length - 12} more contributors on GitHub
                        </a>
                     </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. CHART (Commit Activity) */}
            {chartData && chartData.length > 0 && (
              <div className="bg-gray-900/40 backdrop-blur-md rounded-2xl border border-white/5 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold flex items-center gap-2 text-white"><GitCommit className="w-5 h-5 text-purple-400" /> Commit Frequency</h3>
                  <div className="text-xs text-gray-500 uppercase font-bold bg-white/5 px-3 py-1 rounded-full">
                    {vitality.isNew ? "Last 30 Days" : "Last Year"}
                  </div>
                </div>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                      <XAxis dataKey="week" stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} minTickGap={vitality.isNew ? 1 : 30} />
                      <YAxis stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: "#111827", borderColor: "#374151", borderRadius: "8px", color: "#fff" }} />
                      <Area type="monotone" dataKey="total" stroke="#a855f7" strokeWidth={2} fillOpacity={1} fill="url(#colorTotal)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* 3. RECENT ACTIVITY (Commits) */}
            {commits.length > 0 && (
              <div className="bg-gray-900/40 backdrop-blur-md rounded-2xl border border-white/5 overflow-hidden">
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold flex items-center gap-2 text-white">
                      <Activity className="w-5 h-5 text-purple-400" />
                      Recent Activity
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">What's happening right now?</p>
                  </div>
                  <a href={`${repo.html_url}/commits`} target="_blank" className="text-xs font-bold bg-purple-500/10 text-purple-400 px-3 py-2 rounded-lg hover:bg-purple-500/20 transition">
                    Full History
                  </a>
                </div>

                <div className="divide-y divide-white/5">
                  {commits.map((commit) => {
                    const style = getCommitTypeStyle(commit.commit_message);
                    return (
                      <div key={commit.sha} className="p-5 hover:bg-white/[0.02] transition-colors group relative">
                        <div className="flex items-start gap-4">
                           {/* Author Avatar */}
                           <div className="flex-shrink-0">
                              {commit.author_avatar_url ? (
                                <img src={commit.author_avatar_url} alt="" className="w-12 h-12 rounded-xl border border-gray-700 group-hover:border-purple-500/50 transition-colors shadow-sm" />
                              ) : (
                                <div className="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center text-sm font-bold text-gray-400 border border-gray-700">
                                  {commit.author_name?.charAt(0)}
                                </div>
                              )}
                           </div>

                           {/* Content */}
                           <div className="flex-1 min-w-0 pt-0.5">
                              <div className="flex items-center justify-between gap-4 mb-1">
                                 <div className="flex items-center gap-2 min-w-0">
                                    <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${style.bg} ${style.color} ${style.border}`}>
                                      {style.label}
                                    </span>
                                    <span className="text-sm font-medium text-gray-400 truncate">
                                       <span className="text-gray-200 font-bold hover:underline cursor-pointer">{commit.author_login || commit.author_name}</span> committed
                                    </span>
                                 </div>
                                 <span className="text-xs text-gray-500 whitespace-nowrap flex-shrink-0">{formatTimeAgo(commit.committer_date)}</span>
                              </div>

                              <a href={commit.html_url} target="_blank" className={`block text-base font-semibold leading-snug ${style.color} hover:brightness-125 transition-all mb-2 line-clamp-1`}>
                                {truncateMessage(commit.commit_message)}
                              </a>

                              <div className="flex items-center gap-4 text-xs text-gray-500">
                                <span className="font-mono bg-black/30 px-2 py-0.5 rounded text-gray-400 border border-white/5 hover:border-purple-500/30 transition-colors cursor-pointer">
                                  {commit.sha.substring(0, 7)}
                                </span>
                                {commit.files_changed > 0 && <span className="flex items-center gap-1"><Code className="w-3 h-3"/> {commit.files_changed} files</span>}
                                {(commit.additions > 0 || commit.deletions > 0) && (
                                   <div className="flex items-center gap-2">
                                      <span className="text-emerald-500">+{commit.additions}</span>
                                      <span className="text-red-500">-{commit.deletions}</span>
                                   </div>
                                )}
                              </div>
                           </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Stats & Tech (Sticky) */}
          <div className="space-y-6">

            {/* 1. VITAL STATS */}
            <div className="bg-gray-900/40 backdrop-blur-md rounded-2xl border border-white/5 p-6">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6">Vital Statistics</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-xl p-4 border border-white/5 hover:border-yellow-500/30 transition-colors">
                  <div className="flex items-center gap-2 text-yellow-400 mb-2"><Star className="w-4 h-4" /><span className="text-xs font-bold uppercase opacity-80">Stars</span></div>
                  <div className="text-2xl font-bold text-white">{formatNumber(repo.stars_count)}</div>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/5 hover:border-blue-500/30 transition-colors">
                  <div className="flex items-center gap-2 text-blue-400 mb-2"><GitFork className="w-4 h-4" /><span className="text-xs font-bold uppercase opacity-80">Forks</span></div>
                  <div className="text-2xl font-bold text-white">{formatNumber(repo.forks_count)}</div>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/5 hover:border-purple-500/30 transition-colors">
                  <div className="flex items-center gap-2 text-purple-400 mb-2"><Eye className="w-4 h-4" /><span className="text-xs font-bold uppercase opacity-80">Watchers</span></div>
                  <div className="text-2xl font-bold text-white">{formatNumber(repo.watchers_count)}</div>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/5 hover:border-red-500/30 transition-colors">
                  <div className="flex items-center gap-2 text-red-400 mb-2"><AlertCircle className="w-4 h-4" /><span className="text-xs font-bold uppercase opacity-80">Issues</span></div>
                  <div className="text-2xl font-bold text-white">{formatNumber(repo.open_issues_count)}</div>
                </div>
              </div>
            </div>

            {/* 2. PROJECT DNA (CONTEXT AWARE ANALYTICS) */}
            <div className="bg-gray-900/40 backdrop-blur-md rounded-2xl border border-white/5 p-6 relative overflow-hidden">
              {/* Context Badge for New Repos */}
              {vitality.isNew && (
                <div className="absolute top-0 right-0 bg-gradient-to-bl from-purple-600 to-transparent w-16 h-16 flex items-start justify-end p-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                  </span>
                </div>
              )}

              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                <Code2 className="w-4 h-4" />
                {vitality.isNew ? "Startup DNA" : "Project DNA"}
              </h3>

              <div className="space-y-4">

                {/* A. MAINTENANCE STATUS */}
                <div className={`flex items-center gap-3 p-3 rounded-xl border ${vitality.statusColor}`}>
                  <div className={`p-2 rounded-lg bg-white/10`}>
                    <vitality.StatusIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs uppercase font-bold opacity-70 mb-0.5">Current Status</div>
                    <div className="text-sm font-bold">{vitality.statusLabel}</div>
                  </div>
                </div>

                {/* B. WORK RATE */}
                <div className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/5">
                  <div className="p-2 rounded-lg bg-white/10 text-purple-400">
                    <vitality.WorkIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs uppercase font-bold text-gray-500 mb-0.5">{vitality.workRateLabel}</div>
                    <div className="text-sm font-bold text-white">{vitality.workRateValue}</div>
                  </div>
                </div>

                {/* C. HYPE/GROWTH */}
                <div className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/5">
                  <div className="p-2 rounded-lg bg-white/10 text-yellow-400">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs uppercase font-bold text-gray-500 mb-0.5">{vitality.hypeLabel}</div>
                    <div className="text-sm font-bold text-white">
                      {vitality.starVelocity} stars / day
                    </div>
                  </div>
                </div>

                {/* D. SIZE & AGE */}
                <div className="flex items-center justify-between pt-2 px-1">
                   {/* FIXED: Size text color changed to white */}
                   <div className="text-xs font-medium text-gray-500 flex items-center gap-2">
                      <Database className="w-3 h-3" /> <span className="text-white">{formatSize(repo.size_kb)}</span>
                   </div>
                   <div className="text-xs font-mono text-gray-300">
                     {vitality.isNew
                       ? `${vitality.ageInDays} days old`
                       : `${(vitality.ageInDays / 365).toFixed(1)} years old`}
                   </div>
                </div>

              </div>
            </div>

            {/* 3. LANGUAGES */}
            {repo.languages && repo.languages.length > 0 && (
              <div className="bg-gray-900/40 backdrop-blur-md rounded-2xl border border-white/5 p-6">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Tech Stack</h3>
                <div className="flex h-3 rounded-full overflow-hidden mb-4 bg-gray-800">
                  {repo.languages.map((lang) => (
                    <div key={lang.language_name} style={{ width: `${lang.percentage}%`, backgroundColor: languageColors[lang.language_name] || "#6366f1" }} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {repo.languages.slice(0, 6).map((lang) => (
                    <div key={lang.language_name} className="flex items-center gap-2 text-sm">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: languageColors[lang.language_name] || "#6366f1" }} />
                      <span className="text-gray-300">{lang.language_name}</span>
                      <span className="text-gray-500 text-xs">{Math.round(lang.percentage)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. TOPICS */}
            {repo.topics && repo.topics.length > 0 && (
              <div className="bg-gray-900/40 backdrop-blur-md rounded-2xl border border-white/5 p-6">
                 <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Topics</h3>
                 <div className="flex flex-wrap gap-2">
                    {repo.topics.map(topic => (
                        <span key={topic} className="px-3 py-1 bg-white/5 hover:bg-purple-500/20 border border-white/10 hover:border-purple-500/30 rounded-full text-xs text-gray-300 transition-colors cursor-default">#{topic}</span>
                    ))}
                 </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default RepositoryDetail
