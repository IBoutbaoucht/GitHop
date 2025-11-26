import pool from '../db.js';
import { GraphQLClient, gql } from 'graphql-request';
import { DeveloperPersonas, CurrentWorkStatus, PrimaryWorkStatus, RepoLink , LanguageExpertise , LanguageStats} from '../types/developerModels.js';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

class developerWorkerService {
  private graphqlClient: GraphQLClient;

  constructor() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN is not set.');
    this.graphqlClient = new GraphQLClient(GITHUB_GRAPHQL_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // ===========================================================================
  // MISSION CONTROL
  // ===========================================================================

  public async runAllMissions(): Promise<void> {
    console.log("🚀 Starting Global Developer Sync...");
    await this.syncHallOfFame();
    await this.syncTrendingExperts();
    await this.syncRisingStars();
    console.log("✅ All Missions Complete.");
  }

  /**
   * NEW: Fetch a specific developer by username (Manual Trigger)
   */
  public async fetchSpecificDeveloper(username: string): Promise<void> {
    console.log(`🎯 Manual Fetch: ${username}...`);
    await this.analyzeAndSaveManualDeveloper(username);
    console.log(`✅ Manual Fetch Complete: ${username}`);
  }

  public async syncHallOfFame(): Promise<void> {
    console.log("🏆 Mission: Hall of Fame (Top 200)...");
    const query = "followers:>500 sort:followers"; 
    await this.scoutAndProcess(query, 'hall_of_fame', 200); 
  }

  public async syncTrendingExperts(): Promise<void> {
    console.log("🔥 Mission: Trending Experts...");
    const archetypes = [
      { name: "AI/ML", query: "topic:machine-learning followers:>50 sort:followers" },
      { name: "Systems", query: "language:rust language:c language:cpp followers:>50 sort:followers" },
      { name: "Web3", query: "topic:solidity followers:>50 sort:followers" },
      { name: "DevOps", query: "topic:kubernetes topic:terraform followers:>50 sort:followers" },
      { name: "Frontend", query: "topic:react topic:vue followers:>100 sort:followers" },
      { name: "Security", query: "topic:security topic:hacking followers:>50 sort:followers" },
      { name: "Data Eng", query: "topic:data-engineering topic:spark followers:>50 sort:followers" },
      { name: "Mobile", query: "topic:ios topic:android followers:>50 sort:followers" },
      { name: "Game Dev", query: "topic:game-development topic:unity followers:>50 sort:followers" }
    ];

    for (const type of archetypes) {
      console.log(`   ↳ Scouting ${type.name}...`);
      await this.scoutAndProcess(type.query, 'trending_expert', 40); 
    }
  }

  public async syncRisingStars(): Promise<void> {
    console.log("🚀 Mission: Rising Stars...");
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const dateStr = twoYearsAgo.toISOString().split('T')[0];
    const query = `created:>${dateStr} followers:>50 sort:followers`;
    await this.scoutAndProcess(query, 'rising_star', 100);
  }

  // ===========================================================================
  // INTERNAL LOGIC
  // ===========================================================================

  private async scoutAndProcess(searchQuery: string, sourceCategory: string, totalLimit: number): Promise<void> {
    let fetchedCount = 0;
    let page = 1;
    const perPage = 100;

    try {
      while (fetchedCount < totalLimit) {
        const response = await fetch(
          `https://api.github.com/search/users?q=${encodeURIComponent(searchQuery)}&per_page=${perPage}&page=${page}`,
          { headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } }
        );
        
        if (!response.ok) break;
        const data = await response.json();
        const candidates = data.items || [];
        if (candidates.length === 0) break;

        for (const candidate of candidates) {
           if (fetchedCount >= totalLimit) break;
           await this.analyzeAndSaveDeveloper(candidate.login, sourceCategory);
           await this.sleep(1200); 
           fetchedCount++;
        }
        page++;
        await this.sleep(2000); 
      }
    } catch (e) {
      console.error("   ❌ Scouting error:", e);
    }
  }

  private async analyzeAndSaveDeveloper(login: string, sourceCategory: string): Promise<void> {
    await this.processDeveloperData(login, sourceCategory, false);
  }

  private async analyzeAndSaveManualDeveloper(login: string): Promise<void> {
    await this.processDeveloperData(login, 'rising_star', true);
  }

  // --- CORE PROCESSOR (Unified Logic) ---
  private async processDeveloperData(login: string, sourceCategory: string, forceRising: boolean): Promise<void> {
    let restProfile: any = {};
    try {
      const r = await fetch(`https://api.github.com/users/${login}`, {
        headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` }
      });
      if (!r.ok) {
         console.log(`User ${login} not found`);
         return;
      }
      restProfile = await r.json();
    } catch (e) { return; }

    const isOrganization = restProfile.type === 'Organization';
    let graphqlData: any;
    
    const commonFields = `
      databaseId, login, name, avatarUrl, bio, company, location, websiteUrl, twitterUsername, createdAt, url
      repositories(first: 20, orderBy: {field: STARGAZERS, direction: DESC}, isFork: false) {
          nodes {
              databaseId, name, description, url, stargazerCount, pushedAt, diskUsage
              owner { login }
              primaryLanguage { name }
              defaultBranchRef { target { ... on Commit { history { totalCount } } } }
              repositoryTopics(first: 5) { nodes { topic { name } } }
          }
      }
    `;

    const contribQuery = `
      contributionsCollection {
          commitContributionsByRepository(maxRepositories: 20) {
              contributions(first: 1) { totalCount } 
              repository {
                  databaseId, name, description, url, stargazerCount, pushedAt, diskUsage
                  owner { login }
                  primaryLanguage { name }
                  repositoryTopics(first: 5) { nodes { topic { name } } }
              }
          }
      }
    `;

    if (isOrganization) {
        const orgQuery = gql`query Org($login: String!) { organization(login: $login) { ${commonFields} description } }`;
        try {
            const res: any = await this.graphqlClient.request(orgQuery, { login });
            graphqlData = res.organization;
            graphqlData.bio = graphqlData.description; 
            graphqlData.contributionData = [];
        } catch (e) { return; }
    } else {
        const userQuery = gql`query User($login: String!) { user(login: $login) { ${commonFields} ${contribQuery} } }`;
        try {
            const res: any = await this.graphqlClient.request(userQuery, { login });
            graphqlData = res.user;
            graphqlData.contributionData = res.user.contributionsCollection?.commitContributionsByRepository || [];
        } catch (e) { return; }
    }

    if (!graphqlData) return;

    const ownedRepos = graphqlData.repositories?.nodes || [];
    const contributionData = graphqlData.contributionData || [];
    
    // Extract Contributed Repos (External)
    const contributedRepos = contributionData
        .map((c: any) => ({ ...c.repository, recentCommits: c.contributions.totalCount }))
        .filter((r: any) => r.owner.login !== login);

    // 1. Calculate Primary Work (Magnum Opus)
    const primaryWork = await this.calculatePrimaryWork(ownedRepos, login);

    // 2. Calculate Current Work (Pulse)
    const currentWork = await this.calculateCurrentWork([...ownedRepos, ...contributedRepos], login);

    // 3. Calculate Personas (Using All Repos)
    const allReposForAnalysis = [...ownedRepos, ...contributedRepos];
    const totalStars = ownedRepos.reduce((sum: number, r: any) => sum + r.stargazerCount, 0);
    const personas = this.calculatePersonas(allReposForAnalysis, graphqlData.bio || "");
    
    // NEW: Calculate language expertise
    const languageStats = this.calculateLanguageExpertise(allReposForAnalysis, login);
    
    const yearsActive = Math.floor((Date.now() - new Date(graphqlData.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 365));
    const velocityScore = totalStars / Math.max(1, yearsActive * 12);
    
    const isRisingStar = forceRising || (!isOrganization && velocityScore > 10 && yearsActive < 2);

    await this.saveDeveloperToDB({
      ...graphqlData,
      restProfile,
      isOrganization,
      totalStars,
      velocityScore,
      isRisingStar,
      scoutSource: sourceCategory, 
      badges: [],
      personas,
      topRepos: ownedRepos.slice(0, 3),
      contributedRepos: contributedRepos.slice(0, 5),
      primaryWork, 
      currentWork,
      languageStats // NEW: Add language stats
    });
}

  // --- INTELLIGENCE: PRIMARY WORK (Effort + Impact) ---
  private async calculatePrimaryWork(repos: any[], ownerLogin: string): Promise<PrimaryWorkStatus> {
    if (repos.length === 0) return { status: 'single_masterpiece', repos: [] };

    const scoredRepos = await Promise.all(repos.map(async (repo: any) => {
        const stars = repo.stargazerCount || 0;
        const commits = repo.defaultBranchRef?.target?.history?.totalCount || 0;
        const size = repo.diskUsage || 0;
        const isSystemLang = ['C', 'C++', 'Rust', 'Go'].includes(repo.primaryLanguage?.name);

        // Weighting: Commits reflect effort, Stars reflect impact
        let score = (stars * 0.4) + (commits * 0.6);
        if (isSystemLang && size > 10000) score *= 1.2; // Boost for heavy systems work

        // Link to internal DB if exists
        const internalLink = await this.findInternalRepo(repo.owner.login, repo.name, repo);

        return {
            name: repo.name,
            owner: repo.owner.login,
            url: repo.url,
            description: repo.description,
            language: repo.primaryLanguage?.name,
            stars,
            effort_score: score,
            is_contribution: false,
            ...internalLink 
        } as RepoLink;
    }));

    scoredRepos.sort((a, b) => (b.effort_score || 0) - (a.effort_score || 0));
    const winner = scoredRepos[0];
    const runnerUp = scoredRepos[1];

    if (runnerUp && (runnerUp.effort_score! >= winner.effort_score! * 0.9)) {
        return { status: 'dual_wielding', repos: [winner, runnerUp] };
    }
    return { status: 'single_masterpiece', repos: [winner] };
  }

  // --- INTELLIGENCE: CURRENT WORK (Pulse) ---
  private async calculateCurrentWork(repos: any[], ownerLogin: string): Promise<CurrentWorkStatus> {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const activeRepos = await Promise.all(repos
        .filter((r: any) => new Date(r.pushedAt) > ninetyDaysAgo)
        .map(async (r: any) => {
            const recentCommits = r.recentCommits || 1; 
            const daysSincePush = Math.floor((Date.now() - new Date(r.pushedAt).getTime()) / (1000 * 60 * 60 * 24));
            const score = (recentCommits * 10) - daysSincePush;

            const internalLink = await this.findInternalRepo(r.owner.login, r.name, r);

            return {
                name: r.name,
                owner: r.owner.login,
                url: r.url,
                description: r.description,
                language: r.primaryLanguage?.name,
                stars: r.stargazerCount,
                last_pushed_at: r.pushedAt,
                pulse_score: score,
                is_contribution: r.owner.login !== ownerLogin,
                ...internalLink
            } as RepoLink;
        }));

    if (activeRepos.length === 0) return { status: 'dormant', repos: [] };

    activeRepos.sort((a, b) => (b.pulse_score || 0) - (a.pulse_score || 0));
    const current = activeRepos[0];
    const next = activeRepos[1];

    if (next && (next.pulse_score! >= current.pulse_score! * 0.8)) {
        return { status: 'multi_tasking', repos: [current, next] };
    }
    return { status: 'focused', repos: [current] };
  }

  // --- HELPER: INTERNAL LINKER & CACHER ---
// Replace the findInternalRepo function in developerWorkerService.ts

  private async findInternalRepo(owner: string, name: string, repoData: any = null): Promise<{ internal_repo_id?: number, internal_table?: string }> {
    const tables = ['tops', 'trendings', 'growings', 'repositories_index'];
    
    // 1. Check existing tables using full_name for accuracy
    const fullName = `${owner}/${name}`;
    
    for (const table of tables) {
      try {
        const res = await pool.query(
          `SELECT id FROM ${table} WHERE full_name = $1 LIMIT 1`, 
          [fullName]
        );
        if (res.rows.length > 0) {
          return { internal_repo_id: res.rows[0].id, internal_table: table };
        }
      } catch (e) {
        console.warn(`Error checking ${table} for ${fullName}:`, e);
      }
    }

    // 2. If not found and we have repo data, cache stub in index
    if (repoData && repoData.databaseId) {
      try {
        const insertQuery = `
          INSERT INTO repositories_index (
            github_id, full_name, name, owner_login, description, html_url, 
            stars_count, language, pushed_at, created_at, updated_at,
            forks_count, watchers_count, open_issues_count, size_kb,
            is_fork, is_archived, is_disabled, visibility, sync_status,
            last_fetched, last_synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 'stub', NOW(), NOW())
          ON CONFLICT (github_id) DO UPDATE SET 
            stars_count = EXCLUDED.stars_count,
            pushed_at = EXCLUDED.pushed_at,
            last_synced_at = NOW()
          RETURNING id
        `;
        
        const res = await pool.query(insertQuery, [
          repoData.databaseId, 
          fullName, 
          name, 
          owner, 
          repoData.description || '', 
          repoData.url, 
          repoData.stargazerCount || 0, 
          repoData.primaryLanguage?.name, 
          repoData.pushedAt,
          repoData.createdAt || new Date().toISOString(),
          repoData.updatedAt || new Date().toISOString(),
          repoData.forkCount || 0,
          0, // watchers_count (not available in this context)
          0, // open_issues_count (not available in this context)
          repoData.diskUsage || 0,
          false, // is_fork
          false, // is_archived
          false, // is_disabled
          'public' // visibility
        ]);
        
        if (res.rows.length > 0) {
          return { internal_repo_id: res.rows[0].id, internal_table: 'repositories_index' };
        } else {
          // If update happened, get the existing id
          const sel = await pool.query('SELECT id FROM repositories_index WHERE github_id = $1', [repoData.databaseId]);
          if (sel.rows.length > 0) {
            return { internal_repo_id: sel.rows[0].id, internal_table: 'repositories_index' };
          }
        }
      } catch (e) {
        // Log but don't fail - we can still show the repo without internal linking
        console.warn(`Warning: Failed to cache repo ${fullName}:`, e instanceof Error ? e.message : e);
      }
    }
    
    return {};
  }

  // --- 18-PERSONA ENGINE v6 ---
  private calculatePersonas(repos: any[], bio: string): DeveloperPersonas {
    const p: any = { 
      ai_whisperer: 0, ml_engineer: 0, data_scientist: 0, computational_scientist: 0, data_engineer: 0,
      chain_architect: 0, cloud_native: 0, devops_deamon: 0, 
      frontend_wizard: 0, ux_engineer: 0, mobile_maestro: 0,
      backend_behemoth: 0, systems_architect: 0, security_sentinel: 0,
      game_guru: 0, iot_tinkerer: 0, 
      tooling_titan: 0, algorithm_alchemist: 0, qa_automator: 0,
      enterprise_architect: 0
    };
    
    const bioLower = bio.toLowerCase();

    const score = (text: string, weight: number) => {
      if (/\b(gpt|llm|transformer|neural|generative ai)\b/.test(text)) p.ai_whisperer += weight * 2;
      if (/\b(pytorch|tensorflow|keras|training|inference|huggingface|model)\b/.test(text)) p.ml_engineer += weight * 1.5;
      if (/\b(pandas|numpy|jupyter|matplotlib|analysis|visualization|insight)\b/.test(text)) p.data_scientist += weight;
      if (/\b(math|mathematics|physics|simulation|scientific|scipy|sympy|julia|fortran|manim|latex|geometry|calculus)\b/.test(text)) p.computational_scientist += weight * 2;
      if (/\b(etl|pipeline|spark|hadoop|airflow|databricks|warehouse|big data|parquet)\b/.test(text)) p.data_engineer += weight * 1.5;
      if (/\b(solidity|smart contract|ethereum|web3|defi|nft|dapp|consensus)\b/.test(text)) p.chain_architect += weight * 2;
      if (/\b(kubernetes|k8s|docker|terraform|aws|gcp|azure|serverless|cloud)\b/.test(text)) p.cloud_native += weight * 1.5;
      if (/\b(ci\/cd|pipeline|jenkins|github actions|automation|sre|observability)\b/.test(text)) p.devops_deamon += weight;
      if (/\b(react|vue|angular|svelte|nextjs|tailwind|css|html|frontend)\b/.test(text)) p.frontend_wizard += weight;
      if (/\b(figma|design system|accessibility|ui\/ux|interaction|animation|canvas)\b/.test(text)) p.ux_engineer += weight * 1.5;
      if (/\b(api|graphql|rest|sql|postgres|redis|kafka|microservices|distributed|node|express)\b/.test(text)) p.backend_behemoth += weight;
      if (/\b(kernel|os|operating system|driver|memory|concurrency|compiler|assembly|embedded|low-level)\b/.test(text)) p.systems_architect += weight * 2.5;
      if (/\b(rust|c|c\+\+|zig)\b/.test(text)) p.systems_architect += weight;
      if (/\b(ios|android|swift|kotlin|flutter|react native|mobile app)\b/.test(text)) p.mobile_maestro += weight * 2;
      if (/\b(security|pentest|hacking|cryptography|auth|oauth|owasp|vulnerability|red team)\b/.test(text)) p.security_sentinel += weight * 2;
      if (/\b(unity|unreal|godot|game|graphics|shader|opengl|vulkan|3d)\b/.test(text)) p.game_guru += weight * 2;
      if (/\b(arduino|raspberry|esp32|firmware|robotics|sensor|iot|mqtt)\b/.test(text)) p.iot_tinkerer += weight * 2;
      if (/\b(cli|terminal|plugin|package|library|config|linter|bundler|npm|shell|bash|zsh|dotfiles)\b/.test(text)) p.tooling_titan += weight * 1.5;
      if (/\b(algorithm|structure|leetcode|interview|competitive|solution)\b/.test(text)) p.algorithm_alchemist += weight * 2;
      if (/\b(testing|selenium|cypress|playwright|qa|automation|e2e)\b/.test(text)) p.qa_automator += weight * 2;
      if (/\b(java|spring|c#|dotnet|enterprise|legacy|soap|architecture)\b/.test(text)) p.enterprise_architect += weight;
    };

    score(bioLower, 50);

    repos.forEach((r: any) => {
      const text = ((r.name || "") + " " + (r.description || "") + " " + (r.primaryLanguage?.name || "") + " " + (r.repositoryTopics?.nodes?.map((t:any) => t.topic.name).join(" ") || "")).toLowerCase();
      const isCuration = /\b(awesome|list|collection|resources|roadmap|interview)\b/.test(r.name.toLowerCase()) || /\b(curated list|collection of)\b/.test(r.description?.toLowerCase() || "");
      const starLog = Math.log10((r.stargazerCount || 0) + 1);
      let dynamicWeight = 10 + (starLog * 5);
      if (isCuration) dynamicWeight *= 0.1;
      score(text, dynamicWeight);
    });
    Object.keys(p).forEach(k => p[k] = Math.min(100, Math.round(p[k])));
    return p;
  }

// Update saveDeveloperToDB to include language_expertise
private async saveDeveloperToDB(data: any): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const yearsActive = Math.floor((Date.now() - new Date(data.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 365));

    const langCounts: Record<string, number> = {};
    (data.topRepos || []).forEach((r: any) => {
      if(r.primaryLanguage?.name) langCounts[r.primaryLanguage.name] = (langCounts[r.primaryLanguage.name] || 0) + 1;
    });
    const dominantLanguage = Object.keys(langCounts).sort((a,b) => langCounts[b] - langCounts[a])[0];

    const query = `
      INSERT INTO developers (
        github_id, login, name, avatar_url, bio,
        followers_count, public_repos_count, total_stars_earned, years_active,
        is_organization, company, location, blog_url, twitter_username,
        dominant_language, is_rising_star, badges, personas,
        velocity_score, scout_source, contributed_repos, 
        current_work, primary_work, language_expertise,
        created_at, last_fetched
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, NOW())
      ON CONFLICT (github_id) DO UPDATE SET
        followers_count = EXCLUDED.followers_count,
        total_stars_earned = EXCLUDED.total_stars_earned,
        is_organization = EXCLUDED.is_organization,
        personas = EXCLUDED.personas,
        is_rising_star = EXCLUDED.is_rising_star,
        contributed_repos = EXCLUDED.contributed_repos,
        current_work = EXCLUDED.current_work,
        primary_work = EXCLUDED.primary_work,
        language_expertise = EXCLUDED.language_expertise,
        last_fetched = NOW()
      RETURNING id
    `;

    const values = [
      data.databaseId, data.login, data.name || data.login, data.avatarUrl, data.bio,
      data.restProfile.followers, data.restProfile.public_repos, data.totalStars, yearsActive,
      data.isOrganization, data.company, data.location, data.websiteUrl, data.twitterUsername,
      dominantLanguage, data.isRisingStar, JSON.stringify(data.badges), JSON.stringify(data.personas),
      data.velocityScore, data.scoutSource, JSON.stringify(data.contributedRepos), 
      JSON.stringify(data.currentWork), 
      JSON.stringify(data.primaryWork),
      JSON.stringify(data.languageStats || {}), // NEW
      data.createdAt
    ];

    const res = await client.query(query, values);
    const devId = res.rows[0].id;

      if (data.topRepos && data.topRepos.length > 0) {
        await client.query('DELETE FROM developer_top_repos WHERE developer_id = $1', [devId]);
        for (const [index, repo] of data.topRepos.entries()) {
          await client.query(`
            INSERT INTO developer_top_repos (developer_id, name, html_url, description, stars_count, language, is_primary)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [devId, repo.name, repo.url, repo.description, repo.stargazerCount, repo.primaryLanguage?.name, index === 0]);
        }
      }

      await client.query('COMMIT');
      console.log(`  ✓ Saved: ${data.login} (Current Work: ${data.currentWork.status})`);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(e);
    } finally {
      client.release();
    }
  }

  /**
   * Analyzes developer's language expertise across all their repositories
   */
  private calculateLanguageExpertise(repos: any[], login: string): LanguageStats {
    const languageMap = new Map<string, {
      repos: any[];
      totalStars: number;
      totalCommits: number;
      isOwner: boolean;
    }>();

    // 1. Aggregate data per language
    repos.forEach(repo => {
      const lang = repo.primaryLanguage?.name;
      if (!lang) return;

      const isOwner = repo.owner?.login === login || repo.owner === login;
      const stars = repo.stargazerCount || repo.stars || 0;
      const commits = repo.recentCommits || repo.defaultBranchRef?.target?.history?.totalCount || 0;

      if (!languageMap.has(lang)) {
        languageMap.set(lang, {
          repos: [],
          totalStars: 0,
          totalCommits: 0,
          isOwner: false
        });
      }

      const data = languageMap.get(lang)!;
      data.repos.push(repo);
      data.totalStars += stars;
      data.totalCommits += commits;
      if (isOwner) data.isOwner = true;
    });

    // 2. Calculate expertise level for each language
    const expertise: LanguageExpertise[] = [];

    languageMap.forEach((data, language) => {
      const reposCount = data.repos.length;
      const avgStars = data.totalStars / reposCount;
      
      // Find largest project
      const largestRepo = data.repos.sort((a, b) => 
        (b.stargazerCount || b.stars || 0) - (a.stargazerCount || a.stars || 0)
      )[0];
      
      const largestStars = largestRepo.stargazerCount || largestRepo.stars || 0;

      // Calculate expertise score (0-100)
      let score = 0;
      
      // Factor 1: Number of repos (max 25 points)
      score += Math.min(reposCount * 2.5, 25);
      
      // Factor 2: Total stars (max 30 points)
      score += Math.min(Math.log10(data.totalStars + 1) * 5, 30);
      
      // Factor 3: Largest project size (max 25 points)
      score += Math.min(Math.log10(largestStars + 1) * 4, 25);
      
      // Factor 4: Commits (max 10 points)
      score += Math.min(Math.log10(data.totalCommits + 1) * 2, 10);
      
      // Factor 5: Ownership bonus (max 10 points)
      if (data.isOwner) score += 10;

      // Determine level based on score
      let level: LanguageExpertise['level'] = 'beginner';
      if (score >= 90) level = 'master';
      else if (score >= 75) level = 'expert';
      else if (score >= 55) level = 'advanced';
      else if (score >= 35) level = 'intermediate';

      expertise.push({
        language,
        level,
        score: Math.round(score),
        repos_count: reposCount,
        total_stars: data.totalStars,
        largest_project: largestRepo.name,
        largest_project_stars: largestStars,
        total_commits: data.totalCommits,
        is_primary: false // Will be set below
      });
    });

    // 3. Sort by score and mark primary
    expertise.sort((a, b) => b.score - a.score);
    if (expertise.length > 0) expertise[0].is_primary = true;

    // 4. Determine favorites (most used)
    const favorites = expertise.slice(0, 3).map(e => e.language);

    // 5. Calculate polyglot score
    const uniqueLangs = expertise.length;
    const diversityScore = Math.min(uniqueLangs * 10, 50); // Max 50 for diversity
    const depthScore = expertise.reduce((sum, e) => sum + e.score, 0) / Math.max(uniqueLangs, 1);
    const polyglot_score = Math.round((diversityScore + depthScore) / 2);

    return {
      expertise,
      favorites,
      polyglot_score
    };
  }

    private sleep(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }

export default new developerWorkerService();