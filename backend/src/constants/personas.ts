// constants/personas.ts

export interface PersonaDefinition {
  id: string;
  label: string;
  // Regex pattern strings for the backend to match
  keywords: string[];
  // How much this persona "costs" or "scores" relative to base star count
  weight: number;
  // Tailwind color classes for the frontend
  color: string;
}

export const PERSONA_DEFINITIONS: PersonaDefinition[] = [
  {
    id: 'ai_whisperer',
    label: 'AI Whisperer',
    keywords: ['gpt', 'llm', 'transformer', 'neural', 'generative ai', 'openai', 'anthropic', 'claude'],
    weight: 2.0,
    color: 'text-pink-400 bg-pink-400/10 border-pink-400/20'
  },
  {
    id: 'ml_engineer',
    label: 'ML Engineer',
    keywords: ['pytorch', 'tensorflow', 'keras', 'training', 'inference', 'huggingface', 'model', 'scikit'],
    weight: 1.5,
    color: 'text-rose-400 bg-rose-400/10 border-rose-400/20'
  },
  {
    id: 'data_scientist',
    label: 'Data Scientist',
    keywords: ['pandas', 'numpy', 'jupyter', 'matplotlib', 'analysis', 'visualization', 'insight', 'tableau'],
    weight: 1.0,
    color: 'text-amber-400 bg-amber-400/10 border-amber-400/20'
  },
  {
    id: 'computational_scientist',
    label: 'Comp. Scientist',
    keywords: ['math', 'mathematics', 'physics', 'simulation', 'scientific', 'scipy', 'sympy', 'julia', 'fortran', 'manim', 'latex', 'geometry', 'calculus'],
    weight: 2.0,
    color: 'text-violet-400 bg-violet-400/10 border-violet-400/20'
  },
  {
    id: 'data_engineer',
    label: 'Data Engineer',
    keywords: ['etl', 'pipeline', 'spark', 'hadoop', 'airflow', 'databricks', 'warehouse', 'big data', 'parquet', 'snowflake'],
    weight: 1.5,
    color: 'text-orange-400 bg-orange-400/10 border-orange-400/20'
  },
  {
    id: 'chain_architect',
    label: 'Chain Architect',
    keywords: ['solidity', 'smart contract', 'ethereum', 'web3', 'defi', 'nft', 'dapp', 'consensus', 'blockchain'],
    weight: 2.0,
    color: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20'
  },
  {
    id: 'cloud_native',
    label: 'Cloud Native',
    keywords: ['kubernetes', 'k8s', 'docker', 'terraform', 'aws', 'gcp', 'azure', 'serverless', 'cloud', 'lambda'],
    weight: 1.5,
    color: 'text-sky-400 bg-sky-400/10 border-sky-400/20'
  },
  {
    id: 'devops_deamon',
    label: 'DevOps Deamon',
    keywords: ['ci/cd', 'pipeline', 'jenkins', 'github actions', 'automation', 'sre', 'observability', 'grafana', 'prometheus'],
    weight: 1.0,
    color: 'text-slate-400 bg-slate-400/10 border-slate-400/20'
  },
  {
    id: 'systems_architect',
    label: 'Systems Architect',
    keywords: ['kernel', 'os', 'operating system', 'driver', 'memory', 'concurrency', 'compiler', 'assembly', 'embedded', 'low-level', 'rust', 'c', 'c\\+\\+', 'zig'],
    weight: 2.2, // Averaged weight
    color: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20'
  },
  {
    id: 'backend_behemoth',
    label: 'Backend Behemoth',
    keywords: ['api', 'graphql', 'rest', 'sql', 'postgres', 'redis', 'kafka', 'microservices', 'distributed', 'node', 'express', 'django', 'spring'],
    weight: 1.0,
    color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
  },
  {
    id: 'frontend_wizard',
    label: 'Frontend Wizard',
    keywords: ['react', 'vue', 'angular', 'svelte', 'nextjs', 'tailwind', 'css', 'html', 'frontend', 'webpack', 'vite'],
    weight: 1.0,
    color: 'text-purple-400 bg-purple-400/10 border-purple-400/20'
  },
  {
    id: 'ux_engineer',
    label: 'UX Engineer',
    keywords: ['figma', 'design system', 'accessibility', 'ui/ux', 'interaction', 'animation', 'canvas', 'framer'],
    weight: 1.5,
    color: 'text-fuchsia-400 bg-fuchsia-400/10 border-fuchsia-400/20'
  },
  {
    id: 'mobile_maestro',
    label: 'Mobile Maestro',
    keywords: ['ios', 'android', 'swift', 'kotlin', 'flutter', 'react native', 'mobile app', 'xcode'],
    weight: 2.0,
    color: 'text-blue-400 bg-blue-400/10 border-blue-400/20'
  },
  {
    id: 'security_sentinel',
    label: 'Security Sentinel',
    keywords: ['security', 'pentest', 'hacking', 'cryptography', 'auth', 'oauth', 'owasp', 'vulnerability', 'red team', 'infosec'],
    weight: 2.0,
    color: 'text-red-400 bg-red-400/10 border-red-400/20'
  },
  {
    id: 'game_guru',
    label: 'Game Guru',
    keywords: ['unity', 'unreal', 'godot', 'game', 'graphics', 'shader', 'opengl', 'vulkan', '3d', 'blender'],
    weight: 2.0,
    color: 'text-lime-400 bg-lime-400/10 border-lime-400/20'
  },
  {
    id: 'iot_tinkerer',
    label: 'IoT Tinkerer',
    keywords: ['arduino', 'raspberry', 'esp32', 'firmware', 'robotics', 'sensor', 'iot', 'mqtt', 'circuit'],
    weight: 2.0,
    color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20'
  },
  {
    id: 'tooling_titan',
    label: 'Tooling Titan',
    keywords: ['cli', 'terminal', 'plugin', 'package', 'library', 'config', 'linter', 'bundler', 'npm', 'shell', 'bash', 'zsh', 'dotfiles'],
    weight: 1.5,
    color: 'text-gray-300 bg-gray-500/10 border-gray-500/20'
  },
  {
    id: 'algorithm_alchemist',
    label: 'Algorithm Alchemist',
    keywords: ['algorithm', 'structure', 'leetcode', 'interview', 'competitive', 'solution', 'dynamic programming'],
    weight: 2.0,
    color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20'
  },
  {
    id: 'qa_automator',
    label: 'QA Automator',
    keywords: ['testing', 'selenium', 'cypress', 'playwright', 'qa', 'automation', 'e2e', 'jest', 'vitest'],
    weight: 2.0,
    color: 'text-teal-400 bg-teal-400/10 border-teal-400/20'
  },
  {
    id: 'enterprise_architect',
    label: 'Enterprise Architect',
    keywords: ['java', 'spring', 'c#', 'dotnet', 'enterprise', 'legacy', 'soap', 'architecture', 'design patterns'],
    weight: 1.0,
    color: 'text-blue-300 bg-blue-300/10 border-blue-300/20'
  }
];
