// background.ts
import type { ColorMap } from "./types";

console.log("Background script loaded at", new Date().toISOString());

// Set up message listener with proper return values
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
    // For async responses, we need to return a promise
    return handleRefreshPalette(message.settings);
  }
  
  // Default return for unhandled message types
  return Promise.resolve({success: false, error: "Unknown message type"});
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

async function fetchPalette(colors: string[], style: string, customDesc?: string): Promise<ColorMap> {
  // Get the provider and API settings
  const settings = await browser.storage.local.get([
    "provider", "ollamaUrl", "openaiKey", "claudeKey"
  ]);
  
  // Default to ollama if no provider is set
  const provider = settings.provider || "ollama";
  console.log(`Using provider: ${provider}`);
  
  const prompt = `
    You are a color‑replacement assistant.
    Given these colors: ${JSON.stringify(colors)}
    and the desired style "${style}${customDesc ? `: ${customDesc}` : ''}", 
    return ONLY a JSON object mapping each original
    color (as given) to a hex replacement.
  `;
  
  console.log(`Sending prompt to ${provider}:`, prompt.substring(0, 100) + "...");
  
  // Choose the appropriate API based on the selected provider
  switch(provider) {
    case "openai":
      return fetchFromOpenAI(colors, style, customDesc, settings.openaiKey, prompt);
    case "claude":
      return fetchFromClaude(colors, style, customDesc, settings.claudeKey, prompt);
    case "ollama":
    default:
      return fetchFromOllama(colors, style, customDesc, settings.ollamaUrl, prompt);
  }
}

// Implement separate functions for each provider
async function fetchFromOllama(colors: string[], style: string, customDesc?: string, ollamaUrl?: string, prompt?: string): Promise<ColorMap> {
  const OLLAMA_URL = ollamaUrl || "http://127.0.0.1:11434/api/chat";
  
  try {
    console.log("Sending request to Ollama:", OLLAMA_URL);
    
    // Your existing Ollama implementation with XMLHttpRequest
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", OLLAMA_URL, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("Accept", "application/json");
      
      // Rest of your XMLHttpRequest implementation...
      xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            console.log("Raw LLM response:", data);
            
            const content = data.message?.content || "";
            console.log("LLM content response:", content);
            
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
              reject(new Error("Failed to parse color map from LLM response"));
              return;
            }
            
            const colorMap = JSON.parse(jsonMatch[0]);
            resolve(colorMap);
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error(`Server returned status ${xhr.status}`));
        }
      };
      
      xhr.onerror = function() {
        console.error("Network error details:", {
          url: OLLAMA_URL,
          readyState: xhr.readyState,
          status: xhr.status,
          statusText: xhr.statusText || "No status text"
        });
        
        reject(new Error(`Network error occurred connecting to ${OLLAMA_URL}`));
      };

      xhr.timeout = 10000;
      xhr.ontimeout = function() {
        console.error("Request timed out after 10 seconds");
        reject(new Error("Request to Ollama timed out"));
      };

      xhr.send(JSON.stringify({
        model: "gemma3:12b",
        messages: [{"role": "user", "content": prompt}]
      }));
    });
  } catch (error) {
    console.error("Error in Ollama request:", error);
    throw error;
  }
}

async function fetchFromOpenAI(colors: string[], style: string, customDesc?: string, apiKey?: string, prompt?: string): Promise<ColorMap> {
  if (!apiKey) {
    throw new Error("OpenAI API key is required. Please set it in the options.");
  }
  
  const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
  
  try {
    console.log("Sending request to OpenAI API");
    
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          {
            "role": "user",
            "content": prompt
          }
        ]
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      throw new Error(`OpenAI API returned ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log("OpenAI response:", data);
    
    const content = data.choices?.[0]?.message?.content || "";
    console.log("OpenAI content response:", content);
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse color map from OpenAI response");
    }
    
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("Error in OpenAI request:", error);
    throw error;
  }
}

async function fetchFromClaude(colors: string[], style: string, customDesc?: string, apiKey?: string, prompt?: string): Promise<ColorMap> {
  if (!apiKey) {
    throw new Error("Claude API key is required. Please set it in the options.");
  }
  
  const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
  
  try {
    console.log("Sending request to Claude API");
    
    const response = await fetch(CLAUDE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-sonnet-20240229",
        max_tokens: 1000,
        messages: [
          {
            "role": "user",
            "content": prompt
          }
        ]
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Claude API error:", errorText);
      throw new Error(`Claude API returned ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log("Claude response:", data);
    
    const content = data.content?.[0]?.text || "";
    console.log("Claude content response:", content);
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse color map from Claude response");
    }
    
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("Error in Claude request:", error);
    throw error;
  }
}

// Add to background.ts
browser.contextMenus.create({
  id: "open-options",
  title: "Color Rewriter Options",
  contexts: ["browser_action"]
});

browser.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "open-options") {
    browser.runtime.openOptionsPage();
  }
});
