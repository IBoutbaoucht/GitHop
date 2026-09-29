import pool from '../db.js';
import { GraphQLClient, gql } from 'graphql-request';
import { DeveloperPersonas, CurrentWorkStatus, PrimaryWorkStatus, RepoLink, LanguageExpertise, LanguageStats, DeveloperBadge } from '../types/developerModels.js';
import { PERSONA_DEFINITIONS } from '../constants/personas.js'; // Ensure .js extension for Node ESM

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
    await this.syncBadgeHolders();
    await this.syncRisingStars();
    console.log("✅ All Missions Complete.");
  }

  public async fetchSpecificDeveloper(username: string): Promise<void> {
    console.log(`🎯 Manual Fetch: ${username}...`);
    // Manual fetch acts as a generic update, we'll treat it as a potential rising star check
    await this.analyzeAndSaveDeveloper(username, 'manual_fetch');
    console.log(`✅ Manual Fetch Complete: ${username}`);
  }

  public async syncHallOfFame(): Promise<void> {
    console.log("🏆 Mission: Hall of Fame (Top 200)...");
    const query = "followers:>500 sort:followers";
    // Context: 'hall_of_fame'
    await this.scoutAndProcess(query, 'hall_of_fame', 200);
  }

  public async syncBadgeHolders(): Promise<void> {
    console.log("🎖️ Mission: Badge Holders & Certified Experts...");
    const badgeQueries = [
      // existing
      { type: 'GDE', query: "GDE Google Developer Expert followers:>20 sort:followers" },
      { type: 'GitHub Star', query: "GitHub Star followers:>20 sort:followers" },
      { type: 'MVP', query: "Microsoft MVP followers:>20 sort:followers" },
      { type: 'AWS Hero', query: "AWS Hero followers:>20 sort:followers" },
      { type: 'Docker Captain', query: "Docker Captain followers:>20 sort:followers" },

      // NEW: Certifications (Targeting specific exact names)
      { type: 'CKA', query: "CKA Certified Kubernetes Administrator followers:>10 sort:followers" },
      { type: 'AWS Solutions Architect', query: "\"AWS Certified Solutions Architect\" followers:>10 sort:followers" },
      { type: 'CISSP', query: "CISSP followers:>10 sort:followers" },
      { type: 'PSM', query: "Professional Scrum Master followers:>10 sort:followers" },
      { type: 'CCIE', query: "CCIE Cisco Certified Internetwork Expert followers:>10 sort:followers" }
    ];

    for (const q of badgeQueries) {
       console.log(`   ↳ Scouting ${q.type}...`);
       await this.scoutAndProcess(q.query, 'badge_holder', 150); // Limit 50 per cert to start
    }
  }

 public async syncTrendingExperts(): Promise<void> {
    console.log("🔥 Mission: Trending Experts (Keyword Optimized)...");

    // FIX: Removed 'language:' filters and converted them to keywords (e.g., "rust" instead of language:rust).
    // This fixes the issue where complex language+keyword queries returned 0 results.
    const archetypes = [
      // --- AI/ML ---
      {
        name: "AI/ML (Core)",
        query: "\"machine learning\" OR \"deep learning\" OR \"pytorch\" OR \"tensorflow\" OR \"jax\" OR \"keras\" followers:>50 sort:followers"
      },
      {
        name: "AI/ML (GenAI)",
        query: "\"llm\" OR \"generative ai\" OR \"huggingface\" OR \"langchain\" OR \"llama\" OR \"transformers\" OR \"gpt\" followers:>50 sort:followers"
      },

      // --- Systems ---
      // FIX: Changed language:rust to "rust"
      {
        name: "Systems (Modern)",
        query: "\"rust\" OR \"ziglang\" OR \"systems programming\" OR \"wasm\" OR \"webassembly\" OR \"compiler dev\" followers:>50 sort:followers"
      },
      // FIX: Changed language:c++ to "c++"
      {
        name: "Systems (Low Level)",
        query: "\"c++\" OR \"cpp\" OR \"kernel\" OR \"operating system\" OR \"embedded\" OR \"firmware\" OR \"driver dev\" followers:>50 sort:followers"
      },

      // --- Web3 ---
      // FIX: Changed language:solidity to "solidity"
      {
        name: "Web3 (Core)",
        query: "\"solidity\" OR \"smart contract\" OR \"ethereum\" OR \"defi\" OR \"web3\" OR \"blockchain\" followers:>50 sort:followers"
      },
      {
        name: "Web3 (Concepts)",
        query: "\"zero knowledge\" OR \"zk-rollup\" OR \"ipfs\" OR \"p2p\" OR \"consensus\" OR \"solana\" followers:>50 sort:followers"
      },

      // --- DevOps ---
      {
        name: "DevOps (Containers)",
        query: "\"kubernetes\" OR \"k8s\" OR \"docker\" OR \"cloud native\" OR \"prometheus\" OR \"grafana\" followers:>50 sort:followers"
      },
      {
        name: "DevOps (Infra)",
        query: "\"terraform\" OR \"opentofu\" OR \"ansible\" OR \"sre\" OR \"devops\" OR \"infrastructure as code\" followers:>50 sort:followers"
      },

      // --- Frontend ---
      // FIX: specialized keywords
      {
        name: "Frontend (Frameworks)",
        query: "\"reactjs\" OR \"vuejs\" OR \"svelte\" OR \"next.js\" OR \"typescript\" OR \"tailwind\" followers:>100 sort:followers"
      },
      {
        name: "Frontend (Visuals)",
        query: "\"webgl\" OR \"three.js\" OR \"pwa\" OR \"ui/ux\" OR \"astro\" OR \"solidjs\" followers:>100 sort:followers"
      },

      // --- Security ---
      {
        name: "Security (Ops)",
        query: "\"security researcher\" OR \"pentest\" OR \"bug bounty\" OR \"infosec\" OR \"red team\" followers:>50 sort:followers"
      },
      {
        name: "Security (Tech)",
        query: "\"malware\" OR \"reverse engineering\" OR \"cryptography\" OR \"exploit\" OR \"zero day\" followers:>50 sort:followers"
      },

      // --- Data Eng ---
      {
        name: "Data Eng (Processing)",
        query: "\"data engineering\" OR \"apache spark\" OR \"kafka\" OR \"airflow\" OR \"hadoop\" OR \"flink\" followers:>50 sort:followers"
      },
      {
        name: "Data Eng (Storage)",
        query: "\"dbt\" OR \"databricks\" OR \"snowflake\" OR \"duckdb\" OR \"clickhouse\" OR \"big data\" followers:>50 sort:followers"
      },

      // --- Mobile ---
      {
        name: "Mobile (Native)",
        query: "\"swift\" OR \"kotlin\" OR \"ios dev\" OR \"android dev\" OR \"mobile dev\" followers:>50 sort:followers"
      },
      {
        name: "Mobile (Cross)",
        query: "\"flutter\" OR \"react native\" OR \"xamarin\" OR \"ionic\" OR \"expo\" followers:>50 sort:followers"
      },

      // --- Game Dev ---
      {
        name: "Game Dev (Engines)",
        query: "\"unity3d\" OR \"unreal engine\" OR \"godot\" OR \"bevy\" OR \"game developer\" followers:>50 sort:followers"
      },
      {
        name: "Game Dev (Tech)",
        query: "\"opengl\" OR \"vulkan\" OR \"shader\" OR \"graphics programming\" OR \"ray tracing\" followers:>50 sort:followers"
      }
    ];

    for (const type of archetypes) {
      console.log(`   ↳ Scouting ${type.name}...`);
      await this.scoutAndProcess(type.query, 'trending_expert', 200);
    }
  }

  public async syncRisingStars(): Promise<void> {
    console.log("🚀 Mission: Rising Stars...");
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const dateStr = twoYearsAgo.toISOString().split('T')[0];
    const query = `created:>${dateStr} followers:>50 sort:followers`;
    // Context: 'rising_star'
    await this.scoutAndProcess(query, 'rising_star', 100);
  }

  // ===========================================================================
  // INTERNAL LOGIC
  // ===========================================================================

  private async scoutAndProcess(searchQuery: string, missionContext: string, totalLimit: number): Promise<void> {
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
           await this.analyzeAndSaveDeveloper(candidate.login, missionContext);
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

  private async analyzeAndSaveDeveloper(login: string, missionContext: string): Promise<void> {
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

    // 4. Identify Badges (GDE, MVP, etc.)
    const badges = this.identifyBadges(graphqlData.bio || "", graphqlData.company || "", ownedRepos);

    // NEW: Calculate language expertise
    const languageStats = this.calculateLanguageExpertise(allReposForAnalysis, login);

    const yearsActive = Math.floor((Date.now() - new Date(graphqlData.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 365));
    const velocityScore = totalStars / Math.max(1, yearsActive * 12);

    // We pass everything to the saver, including the missionContext
    await this.saveDeveloperToDB({
      ...graphqlData,
      restProfile,
      isOrganization,
      totalStars,
      velocityScore,
      badges,
      personas,
      topRepos: ownedRepos.slice(0, 3),
      contributedRepos: contributedRepos.slice(0, 5),
      primaryWork,
      currentWork,
      languageStats,
      missionContext
    });
}

  // --- IDENTIFY BADGES ---
// --- IDENTIFY BADGES ---
  private identifyBadges(bio: string, company: string, repos: any[]): DeveloperBadge[] {
    const badges: DeveloperBadge[] = [];
    const text = (bio + " " + company).toLowerCase();

    // 1. Google Developer Expert (GDE)
    if (text.includes('google developer expert') || text.includes('gde') || text.includes('google expert')) {
        let category = 'General';
        if (text.includes('android')) category = 'Android';
        else if (text.includes('web')) category = 'Web';
        else if (text.includes('cloud') || text.includes('gcp')) category = 'Cloud';
        else if (text.includes('ml') || text.includes('machine learning')) category = 'Machine Learning';
        else if (text.includes('flutter')) category = 'Flutter';
        else if (text.includes('firebase')) category = 'Firebase';
        else if (text.includes('angular')) category = 'Angular';

        badges.push({ type: 'GDE', category });
    }

    // 2. Microsoft MVP
    if (text.includes('microsoft mvp') || text.includes('microsoft most valuable professional')) {
        badges.push({ type: 'MVP' });
    }

    // 3. GitHub Star
    if (text.includes('github star') || text.includes('githubstar')) {
        badges.push({ type: 'GitHub Star' });
    }

    // 4. AWS Hero
    if (text.includes('aws hero') || text.includes('aws community hero')) {
        badges.push({ type: 'AWS Hero' });
    }

    // 5. Docker Captain
    if (text.includes('docker captain')) {
        badges.push({ type: 'Docker Captain' });
    }

    // 6. Big Tech Alumni
    if (['google', 'meta', 'facebook', 'amazon', 'apple', 'netflix', 'microsoft', 'uber', 'airbnb'].some(c => company.toLowerCase().includes(c))) {
        badges.push({ type: 'Big Tech Alumni', category: company });
    }

    // --- NEW: EXACT TYPE CERTIFICATIONS ---

    // 7. CKA
    if (text.includes('certified kubernetes administrator') || text.includes('cka')) {
        badges.push({ type: 'CKA' }); // Exact Type
    }

    // 8. AWS Solutions Architect
    if (text.includes('aws certified solutions architect') || text.includes('solutions architect professional')) {
        badges.push({ type: 'AWS Solutions Architect' }); // Exact Type
    }

    // 9. CISSP
    if (text.includes('cissp') || text.includes('certified information systems security professional')) {
        badges.push({ type: 'CISSP' }); // Exact Type
    }

    // 10. Scrum Master
    if (text.includes('professional scrum master') || text.includes('psm i') || text.includes('psm ii')) {
        badges.push({ type: 'PSM' }); // Exact Type
    }

    // 11. Cisco CCIE
    if (text.includes('ccie') || text.includes('cisco certified internetwork expert')) {
        badges.push({ type: 'CCIE' }); // Exact Type
    }

    return badges;
  }

  // --- SAVE TO DB (WITH 4-BOOLEAN LOGIC) ---
  private async saveDeveloperToDB(data: any): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const yearsActive = Math.floor((Date.now() - new Date(data.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 365));

      let dominantLanguage = null;
      if (data.languageStats && data.languageStats.expertise && data.languageStats.expertise.length > 0) {
          dominantLanguage = data.languageStats.expertise[0].language;
      } else {
          const langCounts: Record<string, number> = {};
          (data.topRepos || []).forEach((r: any) => {
              if(r.primaryLanguage?.name) langCounts[r.primaryLanguage.name] = (langCounts[r.primaryLanguage.name] || 0) + 1;
          });
          dominantLanguage = Object.keys(langCounts).sort((a,b) => langCounts[b] - langCounts[a])[0];
      }

      // 1. Calculate Status Flags
      const isRisingStar = !data.isOrganization && (data.velocityScore > 10 && yearsActive < 2);
      const isBadgeHolder = data.badges && data.badges.length > 0;

      // 2. Logic for Hall of Fame & Trending (Based on Mission)
      const mission = data.missionContext;

      const query = `
        INSERT INTO developers (
          github_id, login, name, avatar_url, bio,
          followers_count, public_repos_count, total_stars_earned, years_active,
          is_organization, company, location, blog_url, twitter_username,
          dominant_language, badges, personas,
          velocity_score, contributed_repos,
          current_work, primary_work, language_expertise,
          created_at, last_fetched,

          -- NEW BOOLEAN COLUMNS
          is_hall_of_fame,
          is_trending_expert,
          is_rising_star,
          is_badge_holder
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW(),

          -- INITIAL VALUES (For new inserts)
          CASE WHEN $24 = 'hall_of_fame' THEN TRUE ELSE FALSE END,
          CASE WHEN $24 = 'trending_expert' THEN TRUE ELSE FALSE END,
          $25, -- Calculated Rising Star
          $26  -- Calculated Badge Holder
        )
        ON CONFLICT (github_id) DO UPDATE SET
          followers_count = EXCLUDED.followers_count,
          total_stars_earned = EXCLUDED.total_stars_earned,
          is_organization = EXCLUDED.is_organization,
          personas = EXCLUDED.personas,
          badges = EXCLUDED.badges,
          contributed_repos = EXCLUDED.contributed_repos,
          current_work = EXCLUDED.current_work,
          primary_work = EXCLUDED.primary_work,
          language_expertise = EXCLUDED.language_expertise,
          last_fetched = NOW(),

          -- INTELLIGENT BOOLEAN UPDATES (Preserve existing flags)
          is_hall_of_fame = CASE
            WHEN $24 = 'hall_of_fame' THEN TRUE
            ELSE developers.is_hall_of_fame
          END,

          is_trending_expert = CASE
            WHEN $24 = 'trending_expert' THEN TRUE
            ELSE developers.is_trending_expert
          END,

          is_rising_star = EXCLUDED.is_rising_star,
          is_badge_holder = EXCLUDED.is_badge_holder

        RETURNING id
      `;

      const values = [
        data.databaseId, data.login, data.name || data.login, data.avatarUrl, data.bio,
        data.restProfile.followers, data.restProfile.public_repos, data.totalStars, yearsActive,
        data.isOrganization, data.company, data.location, data.websiteUrl, data.twitterUsername,
        dominantLanguage, JSON.stringify(data.badges), JSON.stringify(data.personas),
        data.velocityScore, JSON.stringify(data.contributedRepos),
        JSON.stringify(data.currentWork),
        JSON.stringify(data.primaryWork),
        JSON.stringify(data.languageStats || {}),
        data.createdAt,

        // Params for logic
        mission,       // $24
        isRisingStar,  // $25
        isBadgeHolder  // $26
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
      console.log(`  ✓ Saved: ${data.login} (Context: ${mission})`);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(e);
    } finally {
      client.release();
    }
  }

  // --- HELPERS (Keep as is) ---

private async calculatePrimaryWork(repos: any[], ownerLogin: string): Promise<PrimaryWorkStatus> {
    if (repos.length === 0) return { status: 'single_masterpiece', repos: [] };

    const scoredRepos = await Promise.all(repos.map(async (repo: any) => {
        const stars = repo.stargazerCount || 0;
        const commits = repo.defaultBranchRef?.target?.history?.totalCount || 0;
        const size = repo.diskUsage || 0;
        const isSystemLang = ['C', 'C++', 'Rust', 'Go'].includes(repo.primaryLanguage?.name);

        // FIX: "Magnum Opus" Logic
        // Old (Flawed): let score = (stars * 0.4) + (commits * 0.6);
        // New (Improved):
        // 1. Stars are linear (Impact is the primary driver).
        // 2. Commits are logarithmic (Diminishing returns for "commit spam").
        //    Math.log10(100) = 2, Math.log10(10000) = 4.
        //    Multiplying by 20 gives a nice "effort bonus" without overpowering stars.
        let score = stars + (Math.log10(commits + 1) * 20);

        // Bonus for large, complex system projects
        if (isSystemLang && size > 10000) score *= 1.2;

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

    // Sort by the new intelligent score
    scoredRepos.sort((a, b) => (b.effort_score || 0) - (a.effort_score || 0));

    const winner = scoredRepos[0];
    const runnerUp = scoredRepos[1];

    // Threshold for "Dual Wielding" (Runner up must be at least 85% as impressive as the winner)
    if (runnerUp && (runnerUp.effort_score! >= winner.effort_score! * 0.85)) {
        return { status: 'dual_wielding', repos: [winner, runnerUp] };
    }
    return { status: 'single_masterpiece', repos: [winner] };
  }

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

  private async findInternalRepo(owner: string, name: string, repoData: any = null): Promise<{ internal_repo_id?: number }> {
    const fullName = `${owner}/${name}`;

    // 1. Check if it exists first (Optimization)
    const checkRes = await pool.query(`SELECT id FROM repositories WHERE full_name = $1`, [fullName]);
    if (checkRes.rows.length > 0) return { internal_repo_id: checkRes.rows[0].id };

    if (repoData && repoData.databaseId) {
      try {
        // 2. Insert or Update to ensure ID return
        const insertQuery = `
          INSERT INTO repositories (
            github_id, full_name, name, owner_login, description, html_url,
            stars_count, language, pushed_at, created_at, updated_at,
            forks_count, size_kb,
            is_fork, is_archived, is_disabled, visibility,
            sync_status, categories, last_fetched
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'stub', ARRAY['stub'], NOW())
          ON CONFLICT (github_id)
          DO UPDATE SET last_fetched = NOW() -- Dummy update to ensure RETURNING id works
          RETURNING id
        `;

        const res = await pool.query(insertQuery, [
          repoData.databaseId, fullName, name, owner, repoData.description || '', repoData.url,
          repoData.stargazerCount || 0, repoData.primaryLanguage?.name, repoData.pushedAt,
          repoData.createdAt || new Date().toISOString(), repoData.updatedAt || new Date().toISOString(),
          repoData.forkCount || 0, repoData.diskUsage || 0,
          false, false, false, 'public'
        ]);

        if (res.rows.length > 0) return { internal_repo_id: res.rows[0].id };
      } catch (e: any) {
         console.error("Repo insert error", e.message);
      }
    }
    return {};
  }


  private calculatePersonas(repos: any[], bio: string): DeveloperPersonas {
    // 1. Initialize all scores to 0
    const p: Record<string, number> = {};
    PERSONA_DEFINITIONS.forEach(def => {
        p[def.id] = 0;
    });

    const bioLower = bio.toLowerCase();

    // 2. Generic Scoring Function
    const applyScore = (text: string, baseWeight: number) => {
      PERSONA_DEFINITIONS.forEach(def => {
        // Create regex from keywords dynamically: \b(word1|word2|word3)\b
        // We join keywords with | and escape any special regex chars if necessary
        const pattern = new RegExp(`\\b(${def.keywords.join('|')})\\b`, 'i');

        if (pattern.test(text)) {
           p[def.id] += baseWeight * def.weight;
        }
      });
    };

    // 3. Score Bio
    applyScore(bioLower, 50);

    // 4. Score Repos
    repos.forEach((r: any) => {
      const text = ((r.name || "") + " " + (r.description || "") + " " + (r.primaryLanguage?.name || "") + " " + (r.repositoryTopics?.nodes?.map((t:any) => t.topic.name).join(" ") || "")).toLowerCase();

      const isCuration = /\b(awesome|list|collection|resources|roadmap|interview)\b/.test(r.name.toLowerCase()) || /\b(curated list|collection of)\b/.test(r.description?.toLowerCase() || "");

      const starLog = Math.log10((r.stargazerCount || 0) + 1);
      let dynamicWeight = 10 + (starLog * 5);

      if (isCuration) dynamicWeight *= 0.1;

      applyScore(text, dynamicWeight);
    });

    // 5. Cap scores at 100
    Object.keys(p).forEach(k => p[k] = Math.min(100, Math.round(p[k])));

    return p as DeveloperPersonas;
  }

  private calculateLanguageExpertise(repos: any[], login: string): LanguageStats {
    const languageMap = new Map<string, {
      repos: any[];
      totalStars: number;
      totalCommits: number;
      isOwner: boolean;
    }>();

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

    const expertise: LanguageExpertise[] = [];

    languageMap.forEach((data, language) => {
      const reposCount = data.repos.length;

      const largestRepo = data.repos.sort((a, b) =>
        (b.stargazerCount || b.stars || 0) - (a.stargazerCount || a.stars || 0)
      )[0];

      const largestStars = largestRepo.stargazerCount || largestRepo.stars || 0;

      let score = 0;
      score += Math.min(reposCount * 2.5, 25);
      score += Math.min(Math.log10(data.totalStars + 1) * 5, 30);
      score += Math.min(Math.log10(largestStars + 1) * 4, 25);
      score += Math.min(Math.log10(data.totalCommits + 1) * 2, 10);
      if (data.isOwner) score += 10;

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
        is_primary: false
      });
    });

    expertise.sort((a, b) => b.score - a.score);
    if (expertise.length > 0) expertise[0].is_primary = true;

    const favorites = expertise.slice(0, 3).map(e => e.language);
    const uniqueLangs = expertise.length;
    const diversityScore = Math.min(uniqueLangs * 10, 50);
    const depthScore = expertise.reduce((sum, e) => sum + e.score, 0) / Math.max(uniqueLangs, 1);
    const polyglot_score = Math.round((diversityScore + depthScore) / 2);

    return { expertise, favorites, polyglot_score };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new developerWorkerService();
