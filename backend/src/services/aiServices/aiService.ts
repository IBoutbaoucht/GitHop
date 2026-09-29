import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export const generateSummary = async (readmeContent: string): Promise<string> => {
  if (!apiKey || !genAI) {
    return "AI summarization unavailable (Key missing).";
  }

  // Helper to try a specific model
  const tryModel = async (modelName: string) => {
    const model = genAI.getGenerativeModel({ model: modelName });
    const prompt = `Summarize the following GitHub repository README into a single, engaging sentence for a non-technical user. Focus on what it does and why it's useful. Keep it under 30 words.\n\nREADME:\n${readmeContent.slice(0, 5000)}`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  };

  try {
    // 1. Try the fastest/cheapest model first
    return await tryModel("gemini-2.0-flash");
  } catch (error: any) {
    console.warn(`⚠️ gemini-2.0-flash failed (${error.message}). Retrying with gemini-pro...`);

    try {
      // 2. Fallback to the standard model
      return await tryModel("gemini-pro");
    } catch (fallbackError: any) {
      console.error("❌ All AI models failed.");

      // Check for the specific "Not Found" / API not enabled error
      if (fallbackError.message?.includes("404") || fallbackError.message?.includes("not found")) {
        console.error("👉 ACTION REQUIRED: Enable the API here: https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com");
        return "Error: Google AI API not enabled. Check server logs for the link.";
      }
      return "Summary unavailable due to an AI error.";
    }
  }
};
