import { pipeline } from '@huggingface/transformers';
import pool from "../../db.js";

// Singleton to hold the model in memory (so we don't reload it constantly)
let extractor: any = null;

// Lazy-load the model
const getExtractor = async () => {
  if (!extractor) {
    console.log("📥 Loading local embedding model (Xenova/all-MiniLM-L6-v2)...");
    // This downloads the model (~90MB) to your server automatically
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractor;
};

export const generateEmbeddingLocal = async (text: string): Promise<number[]> => {
  const pipe = await getExtractor();
  // Generate embedding with mean pooling and normalization
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  // Convert the Tensor output to a standard JavaScript Array
  return Array.from(output.data);
};

export const embedRepositories = async () => {
  console.log("🚀 Starting Local Embedding Process...");

  // We loop indefinitely until no more work is found
  while (true) {
    // 1. Fetch 50 repos that still have NULL embeddings
    const { rows } = await pool.query(
      `SELECT id, name, description, topics, readme_snippet
       FROM repositories
       WHERE embedding IS NULL
       LIMIT 50`
    );

    if (rows.length === 0) {
      console.log("✅ All repos embedded! Job done.");
      break;
    }

    console.log(`⚡ Processing batch of ${rows.length} repos...`);

    // Process the batch
    for (const repo of rows) {
      try {
        // 2. Create the "Context String"
        // This is what the AI "reads" to understand your repo
        const content = `
          Name: ${repo.name}
          Description: ${repo.description || ""}
          Topics: ${repo.topics ? repo.topics.join(", ") : ""}
          Readme: ${repo.readme_snippet ? repo.readme_snippet.slice(0, 1000) : ""}
        `.trim().slice(0, 8000); // Safety cap for text length

        // 3. Generate Vector (Locally!)
        const embedding = await generateEmbeddingLocal(content);

        // 4. Save to DB
        // JSON.stringify converts [0.1, 0.2...] to a string format Postgres accepts
        await pool.query(
          "UPDATE repositories SET embedding = $1 WHERE id = $2",
          [JSON.stringify(embedding), repo.id]
        );
      } catch (e: any) {
        console.error(`   ❌ Failed to embed ${repo.name}:`, e.message);
      }
    }

    // Tiny pause to let the CPU breathe between batches
    await new Promise(resolve => setTimeout(resolve, 100));
  }
};
