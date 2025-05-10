// filepath: c:\Users\Micha\Documents\Themer\src\api\openai-api.ts
import type { ColorMap } from "../types";

/**
 * Try to get an OpenAI API key from storage (for development)
 */
export async function tryGetDevOpenAIKey(): Promise<string | undefined> {
  try {
    const devKeyData = await browser.storage.local.get("DEV_OPENAI_KEY");
    return devKeyData.DEV_OPENAI_KEY || undefined;
  } catch (e) {
    console.warn("BG: Error checking for development API key", e);
    return undefined;
  }
}

/**
 * Fetch color palette from OpenAI API
 */
export async function fetchFromOpenAI(colors: string[], style: string, customDesc?: string, apiKey?: string, prompt?: string): Promise<ColorMap> {
  // Try to get a development key if no key provided
  let effectiveApiKey = apiKey;
  
  if (!effectiveApiKey) {
    effectiveApiKey = await tryGetDevOpenAIKey();
  }
  
  if (!effectiveApiKey) {
    throw new Error("OpenAI API key is required. Set it in the options page.");
  }
  
  const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
  console.log("BG (fetchFromOpenAI): Sending request to OpenAI API");
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${effectiveApiKey}` },
    body: JSON.stringify({ model: "gpt-3.5-turbo", messages: [{ role: "user", content: prompt }] }) // Using gpt-3.5-turbo for cost/speed
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`BG (fetchFromOpenAI): OpenAI API error ${response.status}: ${errorText}`);
    throw new Error(`OpenAI API Error: ${response.status}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch || !jsonMatch[0]) throw new Error("Failed to parse color map JSON from OpenAI response");
  return JSON.parse(jsonMatch[0]);
}