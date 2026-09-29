import pool from '../../db.js';
import { GraphQLClient, gql } from 'graphql-request';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

class ReadmeWorkerService {
  private graphqlClient: GraphQLClient;

  constructor() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN is not set.');
    this.graphqlClient = new GraphQLClient(GITHUB_GRAPHQL_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  public async updateMissingReadmes(limit = 100000): Promise<void> {
    console.log(`🔄 [README] Retrying ALL missing or failed READMEs (Limit: ${limit})...`);

    // UPDATED QUERY:
    // 1. Includes 'NO_README_FOUND' in the check.
    // 2. Orders by 'last_fetched ASC' to create a rotating queue (FIFO).
    const { rows } = await pool.query(`
      SELECT id, github_id, full_name
      FROM repositories
      WHERE (
        readme_snippet IS NULL
        OR readme_snippet = ''
        OR readme_snippet = 'NO_README_FOUND'
      )
      AND sync_status = 'complete'
      ORDER BY last_fetched ASC NULLS FIRST
      LIMIT $1
    `, [limit]);

    if (rows.length === 0) {
      console.log("   No repositories pending README check.");
      return;
    }

    for (const repo of rows) {
      try {
        await this.fetchAndSaveReadme(repo.github_id, repo.full_name);
        await this.sleep(1000);
      } catch (error: any) {
        console.error(`  ❌ Error processing ${repo.full_name}:`, error.message);
      }
    }
  }

  private async fetchAndSaveReadme(githubId: string, fullName: string): Promise<void> {
    const [owner, name] = fullName.split('/');

    // Checks 9 variations
    const query = gql`
      query GetReadmeVariations($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          mdUpper: object(expression: "HEAD:README.md") { ...BlobFragment }
          mdLower: object(expression: "HEAD:readme.md") { ...BlobFragment }
          mdTitle: object(expression: "HEAD:Readme.md") { ...BlobFragment }
          mdCamel: object(expression: "HEAD:ReadMe.md") { ...BlobFragment }
          mdAllCaps: object(expression: "HEAD:README.MD") { ...BlobFragment }
          plainUpper: object(expression: "HEAD:README") { ...BlobFragment }
          rstUpper: object(expression: "HEAD:README.rst") { ...BlobFragment }
          txtUpper: object(expression: "HEAD:README.txt") { ...BlobFragment }
          plainLower: object(expression: "HEAD:readme") { ...BlobFragment }
        }
      }

      fragment BlobFragment on GitObject {
        ... on Blob { text }
      }
    `;

    try {
      const data: any = await this.graphqlClient.request(query, { owner, name });
      const repo = data.repository;

      if (!repo) return;

      const readmeObject =
        repo.mdUpper || repo.mdLower || repo.mdTitle || repo.mdCamel ||
        repo.mdAllCaps || repo.plainUpper || repo.rstUpper ||
        repo.txtUpper || repo.plainLower;

      const client = await pool.connect();
      try {
        if (readmeObject && readmeObject.text) {
            let readmeText = readmeObject.text;
            readmeText = readmeText.replace(/\u0000/g, ''); // Sanitize
            const readmeSnippet = readmeText.slice(0, 10000);

            await client.query(
                `UPDATE repositories SET readme_snippet = $1, last_fetched = NOW() WHERE github_id = $2`,
                [readmeSnippet, githubId]
            );
            console.log(`  ✓ README saved for ${fullName}`);
        } else {
            // LOGIC REMOVED: We no longer set 'NO_README_FOUND'.
            // HOWEVER: We MUST update 'last_fetched', or the worker will pick this same repo
            // again immediately in the next loop.
            console.log(`  ⚠️ No README found for ${fullName} (Updating timestamp only)`);

            await client.query(
                `UPDATE repositories SET last_fetched = NOW() WHERE github_id = $1`,
                [githubId]
            );
        }
      } finally {
        client.release();
      }

    } catch (error: any) {
      console.error(`  ❌ GraphQL Error for ${fullName}: ${error.message}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new ReadmeWorkerService();
