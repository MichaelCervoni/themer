// background.ts
import type { ColorMap } from "./types";

console.log("Background script loaded at", new Date().toISOString());

const STORAGE_KEYS = {
  SAVED_PALETTES_BY_TLD: "savedPalettesByTld",
  TLD_ACTIVE_SETTINGS: "tldActiveSettings",
  PROVIDER_SETTINGS: ["provider", "ollamaUrl", "openaiKey", "claudeKey"],
  CURRENT_PALETTE: "currentPalette"
};

function getTld(url: string): string | null {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname;
    if (hostname === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
      return hostname;
    }
    const parts = hostname.split('.');
    if (parts.length < 2) return hostname; // e.g. 'com' (unlikely), 'localhost' (already handled)
    // For 'example.com', gives 'example.com'
    // For 'www.example.com', gives 'example.com'
    // For 'sub.example.com', gives 'example.com'
    // For 'example.co.uk', gives 'co.uk' (This is a known limitation for multi-part TLDs)
    return parts.slice(-2).join('.');
  } catch (e) {
    console.error("Error parsing URL for TLD:", url, e);
    return null;
  }
}

function getPaletteCacheKey(style: string, customDesc?: string): string {
  return customDesc ? `${style}_${customDesc}` : style;
}

// Set up message listener with proper return values
browser.runtime.onMessage.addListener(async (message, sender) => {
  console.log(`BG: Message received: ${message.type}`, message, "from sender:", sender.tab ? `tab ${sender.tab.id} (${sender.tab.url})` : (sender.id || 'unknown sender'));

  if (message.type === "COLOR_SET") {
    const colors = message.payload;
    console.log(`Received ${colors.length} colors from content script in tab ${sender.tab?.id}`);
    return Promise.resolve({success: true});
  }

  if (message.type === "REFRESH_PALETTE") {
    console.log("Refreshing palette with settings:", message.settings);
    // Use the explicitly passed targetTab from the message
    const tabToRefresh = message.targetTab as browser.tabs.Tab | undefined;
    if (!tabToRefresh?.id || !tabToRefresh?.url) { // Ensure the passed tab object is valid
      console.error("REFRESH_PALETTE: Target tab information (ID or URL) is missing in the message. Message:", message);
      return Promise.resolve({success: false, error: "Target tab information missing in message"});
    }
    // Ensure you log the tld and settings being processed in handleRefreshPalette
    // console.log(`BG (REFRESH_PALETTE): Calling handleRefreshPalette for tab ${tabToRefresh.id} (${tabToRefresh.url}) with TLD: ${getTld(tabToRefresh.url!)}`);
    return handleRefreshPalette(message.settings, tabToRefresh);
  }

  if (message.type === "GET_ACTIVE_SETTINGS_FOR_TLD") {
    // This message is also sent from popup. If sender.tab is unreliable there, this might also need adjustment.
    // For now, assuming sender.tab is okay for this specific message or it's primarily used by content scripts.
    // If issues persist with GET_ACTIVE_SETTINGS_FOR_TLD from popup, popup should also send its tab URL.
    const urlForTld = sender.tab?.url;
    if (!urlForTld) {
      console.error("BG (GET_ACTIVE_SETTINGS_FOR_TLD): Sender tab URL is missing. Sender:", sender);
      return Promise.resolve(null);
    }
    const tld = getTld(urlForTld);
    if (!tld) {
      console.warn(`BG (GET_ACTIVE_SETTINGS_FOR_TLD): Could not get TLD for URL: ${urlForTld}`);
      return Promise.resolve(null);
    }
    const data = await browser.storage.local.get(STORAGE_KEYS.TLD_ACTIVE_SETTINGS);
    const tldActiveSettings = data[STORAGE_KEYS.TLD_ACTIVE_SETTINGS] || {};
    const settingsForThisTld = tldActiveSettings[tld] || null;
    console.log(`BG (GET_ACTIVE_SETTINGS_FOR_TLD): For TLD '${tld}' (from URL ${urlForTld}), found settings:`, settingsForThisTld ? `${settingsForThisTld.style}, palette items: ${Object.keys(settingsForThisTld.palette || {}).length}` : 'null');
    return Promise.resolve(settingsForThisTld);
  }

  // Default return for unhandled message types
  console.warn("BG: Unknown message type received:", message.type);
  return Promise.resolve({success: false, error: `Unknown message type: ${message.type}`});
});

async function handleRefreshPalette(settings: any, tab: browser.tabs.Tab) { // tab parameter is now guaranteed by the check above
  try {
    // The checks for tab.id and tab.url are now done before calling this function,
    // but keeping them here provides an extra layer of safety if this function is called from elsewhere.
    if (!tab.id || !tab.url) {
        console.error("handleRefreshPalette: Invalid tab information passed.", tab);
        return {success: false, error: "Invalid tab information for palette refresh."};
    }
    const tabId = tab.id;
    const tld = getTld(tab.url);

    if (!tld) return {success: false, error: "Could not determine TLD for the tab."};

    const storageData = await browser.storage.local.get([
        STORAGE_KEYS.SAVED_PALETTES_BY_TLD,
        STORAGE_KEYS.TLD_ACTIVE_SETTINGS
    ]);
    let savedPalettesByTld = storageData[STORAGE_KEYS.SAVED_PALETTES_BY_TLD] || {};
    let tldActiveSettings = storageData[STORAGE_KEYS.TLD_ACTIVE_SETTINGS] || {};

    if (settings.style === "Original") {
      console.log(`Style is "Original" for TLD ${tld}. Clearing active settings.`);
      delete tldActiveSettings[tld];
      await browser.storage.local.set({
        [STORAGE_KEYS.TLD_ACTIVE_SETTINGS]: tldActiveSettings,
        [STORAGE_KEYS.CURRENT_PALETTE]: {} // Clear current palette for popup
      });
      await browser.tabs.sendMessage(tabId, { type: "APPLY_MAP", payload: {} });
      return {success: true, message: "Using original colors, active theme cleared for TLD."};
    }

    const response = await browser.tabs.sendMessage(tabId, {type: "GET_COLORS"});
    if (!response?.colors) return {success: false, error: "Failed to get colors from content script"};
    
    console.log(`Processing ${response.colors.length} colors for TLD ${tld} with style: ${settings.style}`);
    
    let colorMap: ColorMap;
    const paletteCacheKey = getPaletteCacheKey(settings.style, settings.customDescription);

    if (savedPalettesByTld[tld]?.[paletteCacheKey]) {
      console.log(`Using saved palette for TLD ${tld} and key ${paletteCacheKey}`);
      colorMap = savedPalettesByTld[tld][paletteCacheKey];
    } else {
      console.log(`No saved palette found for TLD ${tld} and key ${paletteCacheKey}. Fetching new palette.`);
      try {
        colorMap = await fetchPalette(response.colors, settings.style, settings.customDescription);
        console.log("Generated palette:", colorMap);
        // Save the newly fetched palette
        if (!savedPalettesByTld[tld]) {
          savedPalettesByTld[tld] = {};
        }
        savedPalettesByTld[tld][paletteCacheKey] = colorMap;
        await browser.storage.local.set({ [STORAGE_KEYS.SAVED_PALETTES_BY_TLD]: savedPalettesByTld });
        console.log(`Saved new palette for TLD ${tld} and key ${paletteCacheKey}`);
      } catch (error) {
        console.error("Error generating palette:", error);
        return {success: false, error: `LLM error: ${(error as Error).message || "Unknown error"}`};
      }
    }
        
    // Apply any color overrides from popup settings
    if (settings.colorOverrides) {
      colorMap = { ...colorMap, ...settings.colorOverrides };
      console.log("Palette with overrides:", colorMap);
    }
    
    // Save the current palette for the popup to display & active settings for TLD
    tldActiveSettings[tld] = {
      palette: colorMap,
      style: settings.style,
      customDescription: settings.customDescription,
      // also include overrides if they were applied from popup settings for this specific refresh
      // this ensures that if a user overrides a color, that override persists for the TLD's active setting
      colorOverrides: settings.colorOverrides
    };
    await browser.storage.local.set({ 
      [STORAGE_KEYS.CURRENT_PALETTE]: colorMap,
      [STORAGE_KEYS.TLD_ACTIVE_SETTINGS]: tldActiveSettings
    });
    
    // Apply color mapping to the page
    await browser.tabs.sendMessage(tabId, {
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
  const settings = await browser.storage.local.get(STORAGE_KEYS.PROVIDER_SETTINGS);
  const provider = settings.provider || "ollama";
  console.log(`Using provider: ${provider}`);
  
  const prompt = `
    You are a color‑replacement assistant.
    You will be given a list of colors (in various formats like hex, rgb, rgba, hsl) and a style.
    Your task is to return a JSON object mapping each original color to a new color in HEX format.
    Preserve the general contrast relationships between colors for readability.
    The keys in the returned JSON object must be EXACTLY the same as the input color strings.
    Given these colors: ${JSON.stringify(colors)}
    and the desired style "${style}${customDesc ? `: ${customDesc}` : ''}",
    return ONLY a JSON object mapping each original color (as given) to a hex replacement. Example: {"rgb(255, 0, 0)": "#FF0000", "blue": "#0000FF"}
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
async function fetchFromOllama(colors: string[], style: string, customDesc?: string, ollamaBaseUrlFromSettings?: string, prompt?: string): Promise<ColorMap> {
  // Debug mode code stays the same
  if (ollamaBaseUrlFromSettings === "debug") {
    console.log("DEBUG MODE: Using mock color palette");
    const mockResponse: ColorMap = {};
    colors.forEach(color => {
      // Generate mock colors based on style
      if (style === "Light") {
        // Lighten colors
        mockResponse[color] = color === "rgb(0, 0, 0)" || color.toLowerCase() === "#000000" || color.toLowerCase() === "black" ? "#444444" : "#FAFAFA";
      } else if (style === "Dark") {
        // Darken colors
        mockResponse[color] = color === "rgb(255, 255, 255)" || color.toLowerCase() === "#ffffff" || color.toLowerCase() === "white" ? "#CCCCCC" : "#121212";
      } else {
        // For custom, generate themed colors
        const hue = customDesc?.includes("blue") ? 240 : 
                  customDesc?.includes("green") ? 120 : 
                  customDesc?.includes("red") ? 0 : 
                  Math.floor(Math.random() * 360);
        mockResponse[color] = `hsl(${hue}, 70%, 55%)`;
      }
    });
    return Promise.resolve(mockResponse);
  }

  const baseOllamaUrl = ollamaBaseUrlFromSettings || "http://127.0.0.1:11434";
  // Ensure the base URL is clean and append /api/chat
  const OLLAMA_API_URL = `${baseOllamaUrl.replace(/\/$/, '')}/api/chat`;
  try {
    console.log(`Attempting to fetch from Ollama API: ${OLLAMA_API_URL}`); // Log the actual URL being used
    const response = await fetch(OLLAMA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemma3:12b", // Or your preferred model
        messages: [{ role: "user", content: prompt }],
        format: "json", // Request JSON output
        stream: false
      }),
    });
    
    // Process the response
    if (!response.ok) {
      throw new Error(`Ollama returned status ${response.status}`);
    }
    
    const data = await response.json();
    console.log("Raw LLM response:", data);
    
    const content = data.message?.content || "";
    console.log("LLM content response:", content);
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse color map from LLM response");
    }
    
    return JSON.parse(jsonMatch[0]); // Return the parsed colormap
  } catch (fetchError) {
    console.error("Fetch failed, details:", fetchError);
    // Fall back to XMLHttpRequest
    return new Promise((resolve, reject) => {
      // Rest of XMLHttpRequest implementation remains the same
      const xhr = new XMLHttpRequest();
      xhr.open("POST", OLLAMA_API_URL, true);
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
          url: OLLAMA_API_URL,
          readyState: xhr.readyState,
          status: xhr.status,
          statusText: xhr.statusText || "No status text"
        });
        
        reject(new Error(`Network error occurred connecting to ${OLLAMA_API_URL}`));
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

// Listener for tab updates to apply TLD-specific themes
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Log only for 'complete' status to reduce noise, but be aware other statuses might be relevant for SPAs
  if (changeInfo.status === 'complete' && tab.url) {
    const tld = getTld(tab.url);
    if (!tld) {
        console.warn(`BG (onUpdated): Could not get TLD for URL: ${tab.url} on tab ${tabId}`);
        return;
    }
    console.log(`BG (onUpdated): Tab ${tabId} COMPLETED loading URL ${tab.url} (TLD: ${tld}). Checking for active settings.`);
    const data = await browser.storage.local.get(STORAGE_KEYS.TLD_ACTIVE_SETTINGS);
    const tldActiveSettings = data[STORAGE_KEYS.TLD_ACTIVE_SETTINGS] || {};
    const activeSettingForTld = tldActiveSettings[tld];
    if (activeSettingForTld && activeSettingForTld.palette && Object.keys(activeSettingForTld.palette).length > 0) {
      console.log(`BG (onUpdated): Found active palette for TLD ${tld} (Style: ${activeSettingForTld.style}). Attempting to apply to tab ${tabId}. Palette items: ${Object.keys(activeSettingForTld.palette).length}`);
      try {
        await browser.tabs.sendMessage(tabId, {
          type: "APPLY_MAP",
          payload: activeSettingForTld.palette
        });
        console.log(`BG (onUpdated): APPLY_MAP sent successfully to tab ${tabId} for TLD ${tld}.`);
      } catch (error) {
        if ((error as Error).message.includes("Could not establish connection") || (error as Error).message.includes("Receiving end does not exist")) {
          console.warn(`BG (onUpdated): Could not send APPLY_MAP to tab ${tabId} (TLD ${tld}). Content script might not be ready. Error: ${(error as Error).message}`);
        } else {
          console.error(`BG (onUpdated): Error sending APPLY_MAP to tab ${tabId} (TLD ${tld}):`, error);
        }
      }
    } else {
      console.log(`BG (onUpdated): No active palette (or empty palette) found for TLD ${tld} for tab ${tabId}. Ensuring theme is cleared.`);
      try {
        await browser.tabs.sendMessage(tabId, { type: "APPLY_MAP", payload: {} }); // Send empty map to clear
        console.log(`BG (onUpdated): Sent empty APPLY_MAP to clear theme for tab ${tabId} (TLD ${tld}).`);
      } catch (error) {
          console.warn(`BG (onUpdated): Could not send empty APPLY_MAP to tab ${tabId} (TLD ${tld}) to clear theme. Error: ${(error as Error).message}`);
      }
    }
  } else if (changeInfo.status && tab.url) { // Optional: Log other status changes if needed for debugging SPAs
    // console.log(`BG (onUpdated): Tab ${tabId} status changed to ${changeInfo.status} for URL ${tab.url} (TLD: ${getTld(tab.url)})`);
  }
});
