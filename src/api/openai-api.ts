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
  
  // Generate default prompt if none provided
  if (!prompt) {
    prompt = generateColorPrompt(colors, style, customDesc);
  }
  
  // Log the full prompt for debugging
  console.log("BG (fetchFromOpenAI): SENDING PROMPT TO OPENAI:");
  console.log("--------------------------------");
  console.log(prompt);
  console.log("--------------------------------");
  
  console.log(`BG (fetchFromOpenAI): Sending request with ${colors.length} colors`);
  
  const requestBody = {
    // model: "gpt-4.1-mini",
    model: "o4-mini",
    messages: [{ role: "user", content: prompt }]
  };
  
  // Log the request body
  console.log("BG (fetchFromOpenAI): Request body:", JSON.stringify(requestBody, null, 2));
  
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${effectiveApiKey}` },
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`BG (fetchFromOpenAI): OpenAI API error ${response.status}: ${errorText}`);
    throw new Error(`OpenAI API Error: ${response.status}`);
  }
  
  const data = await response.json();
  
  // Log the full response
  console.log("BG (fetchFromOpenAI): RAW RESPONSE FROM OPENAI:");
  console.log("--------------------------------");
  console.log(JSON.stringify(data, null, 2));
  console.log("--------------------------------");
  
  const content = data.choices?.[0]?.message?.content || "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch || !jsonMatch[0]) {
    console.error("BG (fetchFromOpenAI): Failed to parse response as JSON:", content);
    throw new Error("Failed to parse color map JSON from OpenAI response");
  }
  
  try {
    const colorMap = JSON.parse(jsonMatch[0]);
    
    // Log the parsed color map
    console.log("BG (fetchFromOpenAI): PARSED COLOR MAP:", colorMap);
    
    return colorMap;
  } catch (error) {
    console.error("BG (fetchFromOpenAI): JSON parsing error:", error);
    throw new Error("Failed to parse color map from OpenAI response");
  }
}

// Helper function to generate a color prompt
function generateColorPrompt(colors: string[], style: string, customDesc?: string): string {
  const colorList = colors.join(", ");
  const styleDesc = style === "Custom" && customDesc 
    ? customDesc 
    : (style === "Original" ? "original colors" : `${style.toLowerCase()} theme`);
  
  return `You are a web theme designer. Create a color mapping to transform a website to use a ${styleDesc}.
Original colors: ${colorList}

Return a JSON object where keys are the original colors and values are the new colors in the same format.
Only include the JSON object in your response, and make sure it's valid parseable JSON.
Maintain contrast between text and background colors.
Don't change any colors more than necessary to achieve the desired style.
If the original colors already match the requested style, keep them the same.
Pay special attention to background colors and ensure they change appropriately for the requested theme.`;
}