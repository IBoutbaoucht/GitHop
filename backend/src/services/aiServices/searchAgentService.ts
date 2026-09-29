import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { generateEmbeddingLocal } from "./embeddingService.js";
import pool from "../../db.js";

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

// Define the shape of our "Smart Search" intent
interface SearchIntent {
  semanticQuery: string;
  filters: {
    language?: string;
    minStars?: number;
    isFork?: boolean;
  };
}

// 1. Configure the Gemini Model with a strict JSON Schema
// This forces the AI to return ONLY valid JSON, no markdown or chatting.
const model = genAI?.getGenerativeModel({
  model: "gemini-2.0-flash",
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: {
      type: SchemaType.OBJECT,
      properties: {
        semanticQuery: {
          type: SchemaType.STRING,
          description: "The core concept to search for in vector database (e.g. 'chat app boilerplate')",
        },
        filters: {
          type: SchemaType.OBJECT,
          properties: {
            language: {
              type: SchemaType.STRING,
              description: "Programming language if explicitly mentioned (e.g. 'Go', 'Python')",
              nullable: true,
            },
            minStars: {
              type: SchemaType.NUMBER,
              description: "Minimum stars if user implies 'popular' or 'best' (e.g. 500)",
              nullable: true,
            },
            isFork: {
              type: SchemaType.BOOLEAN,
              description: "Set to false if user implies 'from scratch', 'base', 'starter', or 'boilerplate'",
              nullable: true,
            },
          },
          nullable: false,
        },
      },
      required: ["semanticQuery", "filters"],
    },
  },
});

export const searchIntelligently = async (userQuery: string) => {
  if (!model) throw new Error('GEMINI_API_KEY is required for smart search');
  console.log(`🧠 Processing Smart Search: "${userQuery}"`);

  // --- STEP 1: Understand User Intent (LLM) ---
  const prompt = `
    Analyze this user search query for a GitHub repository search engine.
    Extract the core semantic meaning for vector search and specific metadata filters.

    User Query: "${userQuery}"
  `;

  const result = await model.generateContent(prompt);
  const intent: SearchIntent = JSON.parse(result.response.text());

  console.log("🤖 AI Intent:", JSON.stringify(intent, null, 2));

  // --- STEP 2: Vectorize the Semantic Query (Local Model) ---
  // We use the LOCAL model to match the 384-dim vectors in your DB
  const queryEmbedding = await generateEmbeddingLocal(intent.semanticQuery);

  // --- STEP 3: Execute Hybrid SQL Query (Vector + Metadata) ---
  // We calculate "Similarity" as (1 - Cosine Distance)
  // The <=> operator is "Cosine Distance" in pgvector
  let sql = `
    SELECT
      id, github_id, name, full_name, owner_login, owner_avatar_url,
      description, html_url, stars_count, forks_count,
      language, topics, updated_at,
      1 - (embedding <=> $1) as similarity
    FROM repositories
    WHERE 1=1
  `;

  const params: any[] = [JSON.stringify(queryEmbedding)];
  let idx = 2;

  // Apply Strict Filters from LLM
  if (intent.filters.language) {
    sql += ` AND language ILIKE $${idx}`;
    params.push(intent.filters.language);
    idx++;
  }

  // Explicitly handle boolean false (e.g. "not a fork")
  if (intent.filters.isFork !== null && intent.filters.isFork !== undefined) {
    sql += ` AND is_fork = $${idx}`;
    params.push(intent.filters.isFork);
    idx++;
  }

  if (intent.filters.minStars) {
    sql += ` AND stars_count >= $${idx}`;
    params.push(intent.filters.minStars);
    idx++;
  }

  // Rank by Semantic Similarity
  sql += ` ORDER BY similarity DESC LIMIT 30`;

  const { rows } = await pool.query(sql, params);
  return rows;
};
