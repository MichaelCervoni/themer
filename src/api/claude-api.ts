// filepath: c:\Users\Micha\Documents\Themer\src\api\claude-api.ts
import type { ColorMap } from "../types";

/**
 * Fetch color palette from Anthropic Claude API
 */
export async function fetchFromClaude(colors: string[], style: string, customDesc?: string, apiKey?: string, prompt?: string): Promise<ColorMap> {
  if (!apiKey) throw new Error("Claude API key is required.");
  
  const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
  console.log("BG (fetchFromClaude): Sending request to Claude API");
  
  const response = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json", 
      "x-api-key": apiKey, 
      "anthropic-version": "2023-06-01" 
    },
    body: JSON.stringify({ 
      model: "claude-3-haiku-20240307",  // Using Haiku for cost/speed
      max_tokens: 2000, 
      messages: [{ role: "user", content: prompt }] 
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`BG (fetchFromClaude): Claude API error ${response.status}: ${errorText}`);
    throw new Error(`Claude API Error: ${response.status}`);
  }
  
  const data = await response.json();
  const content = data.content?.[0]?.text || "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch || !jsonMatch[0]) throw new Error("Failed to parse color map JSON from Claude response");
  
  return JSON.parse(jsonMatch[0]);
}