// background.ts
import type { ColorMap } from "./types";

console.log("Background script loaded at", new Date().toISOString());

// Set up message listener
browser.runtime.onMessage.addListener((message, sender) => {
  console.log("Message received:", message);
  
  if (message.type === "COLOR_SET") {
    const colors = message.payload;
    console.log(`Received ${colors.length} colors from content script`);
    return Promise.resolve({success: true});
  }
  
  if (message.type === "REFRESH_PALETTE") {
    // Handle refreshing palette
    console.log("Refreshing palette with settings:", message.settings);
    return handleRefreshPalette(message.settings);
  }
  
  return true;
});

async function handleRefreshPalette(settings: any) {
  try {
    // Get the active tab
    const tabs = await browser.tabs.query({active: true, currentWindow: true});
    if (!tabs[0]?.id) return {success: false, error: "No active tab"};
    
    // Get colors from content script
    const response = await browser.tabs.sendMessage(tabs[0].id, {type: "GET_COLORS"});
    if (!response?.colors) return {success: false, error: "Failed to get colors"};
    
    console.log(`Processing ${response.colors.length} colors with style: ${settings.style}`);
    
    // Get color mapping based on settings
    let colorMap: ColorMap;
    try {
      if (settings.style === "Original") {
        return {success: true, message: "Using original colors"};
      } else {
        colorMap = await fetchPalette(response.colors, settings.style, settings.customDescription);
        console.log("Generated palette:", colorMap);
      }
    } catch (error) {
      console.error("Error generating palette:", error);
      return {success: false, error: `LLM error: ${(error as Error).message || "Unknown error"}`};
    }
    
    // Apply color mapping to the page
    await browser.tabs.sendMessage(tabs[0].id, {
      type: "APPLY_MAP",
      payload: colorMap
    });
    
    return {success: true};
  } catch (error) {
    console.error("Error refreshing palette:", error);
    return {success: false, error: (error as Error).message || "Unknown error"};
  }
}

const OLLAMA_URL = "http://localhost:11434/api/chat";
async function fetchPalette(colors: string[], style: string, customDesc?: string): Promise<ColorMap> {
  console.log(`Generating ${style} palette for ${colors.length} colors${customDesc ? ` with description: ${customDesc}` : ''}`);
  
  const prompt = `
    You are a color‑replacement assistant.
    Given these colors: ${JSON.stringify(colors)}
    and the desired style "${style}${customDesc ? `: ${customDesc}` : ''}", 
    return ONLY a JSON object mapping each original
    color (as given) to a hex replacement.
  `;
  
  console.log("Sending prompt to LLM:", prompt);
  
  try {
    // For Ollama
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        model: "mixtral",
        messages: [{"role": "user", "content": prompt}]
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("LLM API error:", errorText);
      throw new Error(`API returned ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log("Raw LLM response:", data);
    
    // Extract the JSON from the response
    const content = data.message?.content || "";
    console.log("LLM content response:", content);
    
    // Extract JSON object from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse color map from LLM response");
    }
    
    const colorMap = JSON.parse(jsonMatch[0]);
    return colorMap;
  } catch (error) {
    console.error("Error fetching palette:", error);
    throw error;
  }
}

browser.runtime.onMessage.addListener(async (msg, _sender) => {
  if (msg.type !== "COLOR_SET") return;
  const style = (await browser.storage.local.get("style")).style || "Light";
  const map = await fetchPalette(msg.payload, style);
  browser.tabs.sendMessage(_sender.tab!.id!, { type: "APPLY_MAP", payload: map });
});
