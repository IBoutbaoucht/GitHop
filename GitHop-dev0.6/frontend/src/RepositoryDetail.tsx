"use client"

import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  Star,
  GitFork,
  Activity,
  Eye,
  AlertCircle,
  ExternalLink,
  Calendar,
  Code,
  Users,
  Package,
  ArrowLeft,
  GitCommit,
  Tag,
  Shield,
  Globe,
  Zap,
  BarChart3,
} from "lucide-react"
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"

interface Repository {
  id: number
  github_id: number
  name: string
  full_name: string
  owner_login: string
  owner_avatar_url?: string
  description?: string
  html_url: string
  homepage_url?: string
  stars_count: number
  forks_count: number
  watchers_count: number
  open_issues_count: number
  language?: string
  topics?: string[]
  license_name?: string
  created_at: string
  pushed_at?: string
  is_archived: boolean
  is_fork: boolean
  has_issues: boolean
  has_wiki: boolean
  has_pages: boolean
  has_discussions: boolean
  health_score?: number
  activity_score?: number
  days_since_last_commit?: number
  commits_last_year?: number
  latest_release_tag?: string
  total_releases?: number
}

interface RepositoryLanguage {
  language_name: string
  bytes_count: number
  percentage: number
}

interface Contributor {
  login: string
  avatar_url: string
  contributions: number
  html_url: string
}

interface CommitActivity {
  week: string
  total: number
}

interface DetailedRepo extends Repository {
  languages?: RepositoryLanguage[]
  contributors?: Contributor[]
  commit_activity?: CommitActivity[]
  contributors_data_type?: string // *** ADDED THIS FIELD ***
}

const API_BASE = "/api"

const languageColors: Record<string, string> = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Java: "#b07219",
  Go: "#00ADD8",
  Rust: "#dea584",
  "C++": "#f34b7d",
  C: "#555555",
  PHP: "#4F5D95",
  Ruby: "#701516",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  "C#": "#178600",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Shell: "#89e051",
  Dart: "#00B4AB",
}

function RepositoryDetail() {
  const { owner, name } = useParams<{ owner: string; name: string }>()
  const navigate = useNavigate()
  const [repo, setRepo] = useState<DetailedRepo | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadRepoDetails()
  }, [owner, name])

  
  const loadRepoDetails = async () => {
    setIsLoading(true)
    try {
      const fullName = `${owner}/${name}`
      const searchResponse = await fetch(`${API_BASE}/repos/search?full_name=${encodeURIComponent(fullName)}`)
      
      if (!searchResponse.ok) {
        navigate("/")
        return
      }

      const searchData = await searchResponse.json()
      // This response now contains 'contributors_data_type'
      const response = await fetch(`${API_BASE}/repos/${searchData.id}/details`)
      const detailData = await response.json() 
      
      // Fetch contributors from DATABASE
      let contributors: Contributor[] = []
      try {
        const contributorsResponse = await fetch(`${API_BASE}/repos/${searchData.id}/contributors`)
        if (contributorsResponse.ok) {
          contributors = await contributorsResponse.json()
        }
      } catch (error) {
        console.error("Error fetching contributors:", error)
      }
      
      // Fetch commit activity from DATABASE (WEEKLY)
      let commitActivity: CommitActivity[] = []
      try {
        const activityResponse = await fetch(`${API_BASE}/repos/${searchData.id}/commit-activity`)
        if (activityResponse.ok) {
          const activityData = await activityResponse.json()
          
          // Use weekly data directly (last 52 weeks)
          commitActivity = activityData.slice(-52).map((week: any) => ({
            week: new Date(week.week_date).toLocaleDateString("en-US", { 
              month: "short", 
              day: "numeric" 
            }),
            total: week.total_commits || 0
          }))
        }
      } catch (error) {
        console.error("Error fetching commit activity:", error)
      }
      
      setRepo({
        ...detailData, // detailData already has our new flag
        contributors: contributors.length > 0 ? contributors : undefined,
        commit_activity: commitActivity.length > 0 ? commitActivity : undefined,
      })
    } catch (error) {
      console.error("Error loading repo details:", error)
      navigate("/")
    } finally {
      setIsLoading(false)
    }
  }

  const formatNumber = (num: number | undefined | null): string => {
    if (!num) return "0"
    const numValue = typeof num === "string" ? Number.parseInt(num, 10) : num
    if (numValue >= 1_000_000) return (numValue / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M"
    if (numValue >= 1_000) return (numValue / 1_000).toFixed(1).replace(/\.0$/, "") + "K"
    return numValue.toString()
  }

  const formatDate = (date: string | undefined | null): string => {
    if (!date) return "N/A"
    return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
  }


  // Update the formatDate function - add this new function after formatDate:
const formatTimeAgo = (days?: number | null): string => {
  if (days === null || days === undefined) return 'Unknown';
  
  if (days === 0) {
    // Less than a day - calculate hours/minutes
    // You'll need to get the actual pushed_at timestamp
    // For now, return "Today"
    return 'Today';
  }
  
  if (days < 1) {
    const hours = Math.floor(days * 24);
    if (hours === 0) {
      const minutes = Math.floor(days * 24 * 60);
      return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
    }
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
};

// Better approach - calculate from pushed_at timestamp:
const getTimeSinceLastCommit = (pushedAt?: string | null): string => {
  if (!pushedAt) return 'Unknown';
  
  const now = new Date().getTime();
  const pushed = new Date(pushedAt).getTime();
  const diffMs = now - pushed;
  
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (days > 0) {
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  } else if (hours > 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  } else if (minutes > 0) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  } else {
    return 'Just now';
  }
};

  const getActivityLevel = (days?: number | null): { label: string; color: string } => {
    if (days === null || days === undefined) return { label: "Unknown", color: "text-gray-400" }
    if (days <= 7) return { label: "Very Active", color: "text-green-400" }
    if (days <= 30) return { label: "Active", color: "text-blue-400" }
    if (days <= 90) return { label: "Moderate", color: "text-yellow-400" }
    if (days <= 365) return { label: "Low Activity", color: "text-orange-400" }
    return { label: "Inactive", color: "text-red-400" }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading repository details...</p>
        </div>
      </div>
    )
  }

  if (!repo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Repository Not Found</h2>
          <button
            onClick={() => navigate("/")}
            className="mt-4 bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg transition"
          >
            Back to Repositories
          </button>
        </div>
      </div>
    )
  }

  const activity = getActivityLevel(repo.days_since_last_commit)

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white pb-12">
      <header className="sticky top-0 z-50 bg-gray-900/95 backdrop-blur-md border-b border-purple-500/20">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-purple-400 hover:text-purple-300 transition mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-semibold">Back to Repositories</span>
          </button>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {repo.owner_avatar_url && (
                <img
                  src={repo.owner_avatar_url || "/placeholder.svg"}
                  alt={repo.owner_login}
                  className="w-20 h-20 rounded-full border-4 border-purple-500/30"
                />
              )}
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-1">
                  {repo.name}
                </h1>
                <p className="text-gray-400 text-lg">{repo.full_name}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <a
                href={repo.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 px-6 py-3 rounded-lg font-semibold transition flex items-center gap-2"
              >
                <ExternalLink className="w-5 h-5" />
                View on GitHub
              </a>
              {repo.homepage_url && (
                <a
                  href={repo.homepage_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-gray-700 hover:bg-gray-600 px-6 py-3 rounded-lg font-semibold transition flex items-center gap-2"
                >
                  <Globe className="w-5 h-5" />
                  Website
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-gray-800/50 rounded-xl p-6 mb-6 border border-gray-700/50">
          <p className="text-gray-300 text-lg leading-relaxed">{repo.description || "No description available"}</p>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/20 border border-yellow-500/30 rounded-xl p-6">
            <Star className="w-8 h-8 text-yellow-400 mb-3" />
            <div className="text-3xl font-bold text-yellow-400 mb-1">{formatNumber(repo.stars_count)}</div>
            <div className="text-sm text-gray-400">Stars</div>
          </div>
          <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/30 rounded-xl p-6">
            <GitFork className="w-8 h-8 text-blue-400 mb-3" />
            <div className="text-3xl font-bold text-blue-400 mb-1">{formatNumber(repo.forks_count)}</div>
            <div className="text-sm text-gray-400">Forks</div>
          </div>
          <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/20 border border-purple-500/30 rounded-xl p-6">
            <Eye className="w-8 h-8 text-purple-400 mb-3" />
            <div className="text-3xl font-bold text-purple-400 mb-1">{formatNumber(repo.watchers_count)}</div>
            <div className="text-sm text-gray-400">Watchers</div>
          </div>
          <div className="bg-gradient-to-br from-red-500/20 to-red-600/20 border border-red-500/30 rounded-xl p-6">
            <AlertCircle className="w-8 h-8 text-red-400 mb-3" />
            <div className="text-3xl font-bold text-red-400 mb-1">{formatNumber(repo.open_issues_count)}</div>
            <div className="text-sm text-gray-400">Open Issues</div>
          </div>
        </div>


        {repo.topics && repo.topics.length > 0 && (
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50 mb-8">
            <h3 className="text-xl font-bold text-purple-400 mb-4">Topics & Tags</h3>
            <div className="flex flex-wrap gap-3">
              {repo.topics.map((topic) => (
                <span
                  key={topic}
                  className="px-4 py-2 bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 rounded-full text-sm border border-purple-500/30 hover:border-purple-500/60 transition"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-6 mb-8">
          {repo.commit_activity && repo.commit_activity.length > 0 && (
            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50 mb-8">
              <h3 className="text-xl font-bold text-purple-400 mb-4 flex items-center gap-2">
                <GitCommit className="w-5 h-5" /> Commit Activity (Last 52 Weeks)
              </h3>
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={repo.commit_activity}>
                  <defs>
                    <linearGradient id="commitGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="week" stroke="#9ca3af" style={{ fontSize: "12px" }} />
                  <YAxis stroke="#9ca3af" style={{ fontSize: "12px" }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }}
                    labelStyle={{ color: "#d1d5db" }}
                  />
                  <Area type="monotone" dataKey="total" stroke="#8b5cf6" fillOpacity={1} fill="url(#commitGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

        </div>

        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
            <h3 className="text-xl font-bold text-purple-400 mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5" /> Repository Activity
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Status</span>
                <span className={`font-bold text-lg ${activity.color}`}>{activity.label}</span>
              </div>
              {repo.pushed_at && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Last Commit</span>
                  <span className="font-semibold text-white">{getTimeSinceLastCommit(repo.pushed_at)}</span>
                </div>
              )}
              {repo.commits_last_year !== undefined && repo.commits_last_year !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Commits (Year)</span>
                  <span className="font-semibold text-green-400">{formatNumber(repo.commits_last_year)}</span>
                </div>
              )}
              {repo.activity_score !== undefined && repo.activity_score !== null && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400">Activity Score</span>
                    <span className="font-semibold text-purple-400">{Number(repo.activity_score).toFixed(0)}</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-3">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-pink-500 h-3 rounded-full transition-all"
                      style={{ width: `${Math.min(100, Number(repo.activity_score) / 10)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
            <h3 className="text-xl font-bold text-purple-400 mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5" /> Repository Health
            </h3>
            <div className="space-y-4">
              {repo.health_score !== undefined && repo.health_score !== null && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400">Health Score</span>
                    <span className="font-semibold text-green-400">{Number(repo.health_score).toFixed(0)}/100</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-3">
                    <div
                      className="bg-gradient-to-r from-green-500 to-emerald-500 h-3 rounded-full transition-all"
                      style={{ width: `${Number(repo.health_score)}%` }}
                    />
                  </div>
                </div>
              )}
              {/* Only show if total_releases > 0 */}
              {repo.total_releases !== undefined && repo.total_releases !== null && repo.total_releases > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Total Releases</span>
                  <span className="font-semibold text-blue-400">{repo.total_releases}</span>
                </div>
              )}
              {repo.latest_release_tag && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Latest Release</span>
                  <span className="font-semibold text-purple-400 flex items-center gap-1">
                    <Tag className="w-4 h-4" />
                    {repo.latest_release_tag}
                  </span>
                </div>
              )}
              {repo.license_name && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">License</span>
                  <span className="font-semibold text-yellow-400 flex items-center gap-1">
                    <Package className="w-4 h-4" />
                    {repo.license_name}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {repo.contributors && repo.contributors.length > 0 && (
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50 mb-8">
            <h3 className="text-xl font-bold text-purple-400 mb-6 flex items-center gap-2">
              <Users className="w-5 h-5" /> Top Contributors
            </h3>
            
            {/* *** NEW CONDITIONAL MESSAGE *** */}
            {repo.contributors_data_type === 'recent' && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-sm rounded-lg p-4 -mt-2 mb-6 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>The all-time contributor list for this repository is too large to display. Showing top contributors from the 500 most recent commits.</span>
              </div>
            )}
            
            <div className="grid grid-cols-5 gap-4">
              {repo.contributors.slice(0, 10).map((contributor, index) => (
                <a
                  key={contributor.login}
                  href={contributor.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-gray-900/50 rounded-lg p-4 text-center border border-gray-700/30 hover:border-purple-500/50 transition group"
                >
                  <div className="relative inline-block mb-3">
                    <img
                      src={contributor.avatar_url || "/placeholder.svg"}
                      alt={contributor.login}
                      className="w-16 h-16 rounded-full border-2 border-purple-500/30 group-hover:border-purple-500 transition"
                    />
                    {index < 3 && (
                      <div className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </div>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-purple-300 truncate mb-1">{contributor.login}</div>
                  <div className="text-xs text-gray-400">{formatNumber(contributor.contributions)} commits</div>
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
            <h3 className="text-lg font-bold text-purple-400 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5" /> Timeline
            </h3>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-400 mb-1">Created</div>
                <div className="text-white font-semibold">{formatDate(repo.created_at)}</div>
              </div>
              {repo.pushed_at && (
                <div>
                  <div className="text-xs text-gray-400 mb-1">Last Push</div>
                  <div className="text-white font-semibold">{formatDate(repo.pushed_at)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Only show Features if at least one exists */}
          {(repo.has_issues || repo.has_wiki || repo.has_pages || repo.has_discussions || repo.is_archived || repo.is_fork) && (
            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
              <h3 className="text-lg font-bold text-purple-400 mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5" /> Features
              </h3>
              <div className="space-y-2">
                {repo.has_issues && (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-gray-300">Issues Enabled</span>
                  </div>
                )}
                {repo.has_wiki && (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-gray-300">Wiki Available</span>
                  </div>
                )}
                {repo.has_pages && (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-gray-300">GitHub Pages</span>
                  </div>
                )}
                {repo.has_discussions && (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-gray-300">Discussions</span>
                  </div>
                )}
                {repo.is_archived && (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                    <span className="text-orange-300">Archived</span>
                  </div>
                )}
                {repo.is_fork && (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    <span className="text-blue-300">Fork</span>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>


        {repo.languages && repo.languages.length > 0 && (
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
            <h3 className="text-xl font-bold text-purple-400 mb-6 flex items-center gap-2">
              <Code className="w-5 h-5" /> Language Breakdown
            </h3>
            <div className="space-y-4">
              {repo.languages.map((lang) => (
                <div key={lang.language_name}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: languageColors[lang.language_name] || "#6366f1" }}
                      />
                      <span className="text-gray-300 font-semibold">{lang.language_name}</span>
                    </div>
                    <span className="text-gray-400 font-semibold">{Number(lang.percentage).toFixed(2)}%</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-3">
                    <div
                      className="h-3 rounded-full transition-all duration-500"
                      style={{
                        width: `${Number(lang.percentage)}%`,
                        backgroundColor: languageColors[lang.language_name] || "#6366f1",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default RepositoryDetail
