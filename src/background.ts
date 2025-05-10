// background.ts
import type { ColorMap } from "./types";

console.log("BG: Background script loaded at", new Date().toISOString());

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
    if (parts.length < 2) return hostname;
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

async function handleRefreshPalette(settings: any, tab: browser.tabs.Tab): Promise<{success: boolean, error?: string, message?: string}> {
  try {
    if (!tab.id || !tab.url) {
        console.error("BG (handleRefreshPalette): Invalid tab information.", tab);
        return {success: false, error: "Invalid tab information for palette refresh."};
    }
    const tabId = tab.id;
    const tld = getTld(tab.url);

    if (!tld) {
        console.error(`BG (handleRefreshPalette): Could not determine TLD for URL: ${tab.url}`);
        return {success: false, error: "Could not determine TLD for the tab."};
    }

    console.log(`BG (handleRefreshPalette): Processing for TLD '${tld}', TabID: ${tabId}, Style: '${settings.style}'`);

    const storageData = await browser.storage.local.get([
        STORAGE_KEYS.SAVED_PALETTES_BY_TLD,
        STORAGE_KEYS.TLD_ACTIVE_SETTINGS
    ]);
    let savedPalettesByTld = storageData[STORAGE_KEYS.SAVED_PALETTES_BY_TLD] || {};
    let tldActiveSettings = storageData[STORAGE_KEYS.TLD_ACTIVE_SETTINGS] || {};

    if (settings.style === "Original") {
      console.log(`BG (handleRefreshPalette): Style is "Original" for TLD ${tld}. Clearing active settings.`);
      delete tldActiveSettings[tld];
      await browser.storage.local.set({
        [STORAGE_KEYS.TLD_ACTIVE_SETTINGS]: tldActiveSettings,
        [STORAGE_KEYS.CURRENT_PALETTE]: {} 
      });
      await browser.tabs.sendMessage(tabId, { type: "APPLY_MAP", payload: {} });
      return {success: true, message: "Using original colors, active theme cleared for TLD."};
    }
    
    const response = await browser.tabs.sendMessage(tabId, {type: "GET_COLORS"});
    if (!response?.colors) {
        console.error(`BG (handleRefreshPalette): Failed to get colors from content script for tab ${tabId}`);
        return {success: false, error: "Failed to get colors from content script"};
    }
    
    console.log(`BG (handleRefreshPalette): Received ${response.colors.length} colors for TLD ${tld}. Style: ${settings.style}`);
    
    let colorMap: ColorMap;
    const paletteCacheKey = getPaletteCacheKey(settings.style, settings.customDescription);

    if (savedPalettesByTld[tld]?.[paletteCacheKey]) {
      console.log(`BG (handleRefreshPalette): Using saved palette for TLD ${tld}, Key: ${paletteCacheKey}`);
      colorMap = savedPalettesByTld[tld][paletteCacheKey];
    } else {
      console.log(`BG (handleRefreshPalette): No saved palette for TLD ${tld}, Key: ${paletteCacheKey}. Fetching new.`);
      try {
        colorMap = await fetchPalette(response.colors, settings.style, settings.customDescription);
        console.log("BG (handleRefreshPalette): Generated palette:", colorMap);
        
        if (!savedPalettesByTld[tld]) savedPalettesByTld[tld] = {};
        savedPalettesByTld[tld][paletteCacheKey] = colorMap;
        await browser.storage.local.set({ [STORAGE_KEYS.SAVED_PALETTES_BY_TLD]: savedPalettesByTld });
        console.log(`BG (handleRefreshPalette): Saved new palette for TLD ${tld}, Key: ${paletteCacheKey}`);
      } catch (error) {
        console.error("BG (handleRefreshPalette): Error generating palette:", error);
        return {success: false, error: `LLM error: ${(error as Error).message || "Unknown error"}`};
      }
    }
        
    if (settings.colorOverrides) {
      colorMap = { ...colorMap, ...settings.colorOverrides };
      console.log("BG (handleRefreshPalette): Palette with overrides applied:", colorMap);
    }
    
    tldActiveSettings[tld] = {
      palette: colorMap,
      style: settings.style,
      customDescription: settings.customDescription,
      colorOverrides: settings.colorOverrides 
    };

    await browser.storage.local.set({ 
      [STORAGE_KEYS.CURRENT_PALETTE]: colorMap,
      [STORAGE_KEYS.TLD_ACTIVE_SETTINGS]: tldActiveSettings
    });
    console.log(`BG (handleRefreshPalette): Updated TLD_ACTIVE_SETTINGS for '${tld}' and CURRENT_PALETTE.`);
    
    await browser.tabs.sendMessage(tabId, { type: "APPLY_MAP", payload: colorMap });
    console.log(`BG (handleRefreshPalette): APPLY_MAP sent to tab ${tabId} for TLD ${tld}.`);
    return {success: true};

  } catch (error) {
    console.error("BG (handleRefreshPalette): Uncaught error:", error);
    return {success: false, error: (error as Error).message || "Unknown error in handleRefreshPalette"};
  }
}

async function fetchPalette(colors: string[], style: string, customDesc?: string): Promise<ColorMap> {
  const providerSettings = await browser.storage.local.get(STORAGE_KEYS.PROVIDER_SETTINGS);
  const provider = providerSettings.provider || "ollama"; // Default to ollama
  console.log(`BG (fetchPalette): Using provider: ${provider}. Style: ${style}`);
  
  const prompt = `You are a color replacement assistant. You will be given a list of colors (in various formats like hex, rgb, rgba, hsl) and a style. Your task is to return ONLY a JSON object mapping each original color to a new color in HEX format. Preserve the general contrast relationships. The keys in the returned JSON object must be EXACTLY the same as the input color strings.
Given these colors: ${JSON.stringify(colors)}
And the desired style "${style}${customDesc ? `: ${customDesc}` : ''}",
Return ONLY a JSON object mapping each original color (as given) to a hex replacement. Example: {"rgb(255, 0, 0)": "#FF0000", "blue": "#0000FF"}`;
  
  console.log(`BG (fetchPalette): Sending prompt (first 100 chars): ${prompt.substring(0, 100)}...`);

  switch(provider) {
    case "openai":
      return fetchFromOpenAI(colors, style, customDesc, providerSettings.openaiKey, prompt);
    case "claude":
      return fetchFromClaude(colors, style, customDesc, providerSettings.claudeKey, prompt);
    case "ollama":
    default:
      return fetchFromOllama(colors, style, customDesc, providerSettings.ollamaUrl, prompt);
  }
}

async function fetchFromOllama(colors: string[], style: string, customDesc?: string, ollamaBaseUrlFromSettings?: string, prompt?: string): Promise<ColorMap> {
  if (ollamaBaseUrlFromSettings === "debug") {
    console.log("BG (fetchFromOllama): DEBUG MODE - Using mock color palette");
    const mockResponse: ColorMap = {};
    colors.forEach(color => {
      if (style === "Dark") {
        mockResponse[color] = color === "rgb(255, 255, 255)" || color.toLowerCase() === "#ffffff" || color.toLowerCase() === "white" ? "#121212" : "#CCCCCC";
      } else if (style === "Light") {
         mockResponse[color] = color === "rgb(0, 0, 0)" || color.toLowerCase() === "#000000" || color.toLowerCase() === "black" ? "#FAFAFA" : "#444444";
      } else { // Custom or other
        const randomHue = customDesc?.includes("blue") ? 240 : customDesc?.includes("green") ? 120 : Math.floor(Math.random() * 360);
        mockResponse[color] = `hsl(${randomHue}, 70%, ${Math.random() > 0.5 ? '30%' : '80%'})`;
      }
    });
    return Promise.resolve(mockResponse);
  }

  const baseOllamaUrl = ollamaBaseUrlFromSettings || "http://127.0.0.1:11434";
  const OLLAMA_API_URL = `${baseOllamaUrl.replace(/\/$/, '')}/api/chat`;
  console.log(`BG (fetchFromOllama): Attempting to fetch from Ollama API: ${OLLAMA_API_URL}`);

  try {
    // First check if Ollama server is running with a simpler request
    const checkResponse = await fetch(`${baseOllamaUrl.replace(/\/$/, '')}/api/tags`, {
      method: "GET"
    }).catch(error => {
      console.error("BG (fetchFromOllama): Ollama server connectivity check failed:", error);
      throw new Error(`Ollama server connection failed: ${error.message} - Is Ollama running?`);
    });
    
    if (!checkResponse.ok) {
      throw new Error(`Ollama server returned status ${checkResponse.status} during connectivity check`);
    }
    
    console.log("BG (fetchFromOllama): Ollama server connectivity confirmed");
    
    // Now send the actual chat request
    const response = await fetch(OLLAMA_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemma3:12b", // Consider making model configurable
        messages: [{ role: "user", content: prompt }],
        format: "json",
        stream: false
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`BG (fetchFromOllama): Ollama returned status ${response.status}. Body: ${errorText}`);
      throw new Error(`Ollama API Error: ${response.status} - ${errorText.substring(0,100)}`);
    }
    
    const data = await response.json();
    console.log("BG (fetchFromOllama): Raw LLM response:", data);
    const content = data.message?.content || "";
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch || !jsonMatch[0]) {
      console.error("BG (fetchFromOllama): Failed to parse JSON object from LLM response content:", content);
      throw new Error("Failed to parse color map JSON from LLM response");
    }
    return JSON.parse(jsonMatch[0]);
  } catch (fetchError) {
    console.error("BG (fetchFromOllama): Fetch failed:", fetchError);
    throw fetchError; // Re-throw to be caught by handleRefreshPalette
  }
}

async function fetchFromOpenAI(colors: string[], style: string, customDesc?: string, apiKey?: string, prompt?: string): Promise<ColorMap> {
  if (!apiKey) throw new Error("OpenAI API key is required.");
  const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
  console.log("BG (fetchFromOpenAI): Sending request to OpenAI API");
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
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

async function fetchFromClaude(colors: string[], style: string, customDesc?: string, apiKey?: string, prompt?: string): Promise<ColorMap> {
  if (!apiKey) throw new Error("Claude API key is required.");
  const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
  console.log("BG (fetchFromClaude): Sending request to Claude API");
  const response = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-3-haiku-20240307", max_tokens: 2000, messages: [{ role: "user", content: prompt }] }) // Using Haiku for cost/speed
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

browser.runtime.onMessage.addListener(async (message, sender) => {
  console.log(`BG: Message received: ${message.type}`, "from sender:", sender.tab ? `tab ${sender.tab.id} (${sender.tab.url})` : (sender.id || 'popup/background'));
  
  if (message.type === "COLOR_SET") {
    // console.log(`BG: Received ${message.payload.length} colors from content script in tab ${sender.tab?.id}`);
    return Promise.resolve({success: true}); // Acknowledge
  }
  
  if (message.type === "REFRESH_PALETTE") {
    console.log("BG (REFRESH_PALETTE): Received. Settings:", message.settings, "TargetTab:", message.targetTab?.id);
    const tabToRefresh = message.targetTab as browser.tabs.Tab | undefined;
    if (!tabToRefresh?.id || !tabToRefresh?.url) {
      console.error("BG (REFRESH_PALETTE): Target tab information (ID or URL) is missing or invalid.");
      return Promise.resolve({success: false, error: "Target tab information missing or invalid"});
    }
    return handleRefreshPalette(message.settings, tabToRefresh);
  }

  if (message.type === "GET_ACTIVE_SETTINGS_FOR_TLD") {
    const urlForTld = sender.tab?.url; 
    if (!urlForTld) {
      console.error("BG (GET_ACTIVE_SETTINGS_FOR_TLD): Sender tab URL is missing.");
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
    console.log(`BG (GET_ACTIVE_SETTINGS_FOR_TLD): For TLD '${tld}', found settings:`, settingsForThisTld ? `${settingsForThisTld.style}` : 'null');
    return Promise.resolve(settingsForThisTld);
  }
  
  console.warn("BG: Unknown message type received:", message.type);
  return Promise.resolve({success: false, error: `Unknown message type: ${message.type}`});
});

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith("about:")) { // Ignore about: pages
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
      console.log(`BG (onUpdated): Found active palette for TLD ${tld} (Style: ${activeSettingForTld.style}). Applying to tab ${tabId}.`);
      try {
        await browser.tabs.sendMessage(tabId, { type: "APPLY_MAP", payload: activeSettingForTld.palette });
        console.log(`BG (onUpdated): APPLY_MAP sent successfully to tab ${tabId} for TLD ${tld}.`);
      } catch (error) {
        if ((error as Error).message.includes("Could not establish connection") || (error as Error).message.includes("Receiving end does not exist")) {
          console.warn(`BG (onUpdated): Could not send APPLY_MAP to tab ${tabId} (TLD ${tld}). Content script might not be ready. Error: ${(error as Error).message}`);
        } else {
          console.error(`BG (onUpdated): Error sending APPLY_MAP to tab ${tabId} (TLD ${tld}):`, error);
        }
      }
    } else {
      console.log(`BG (onUpdated): No active palette for TLD ${tld} for tab ${tabId}. Ensuring theme is cleared.`);
      try {
        await browser.tabs.sendMessage(tabId, { type: "APPLY_MAP", payload: {} });
        console.log(`BG (onUpdated): Sent empty APPLY_MAP to clear theme for tab ${tabId} (TLD ${tld}).`);
      } catch (error) {
          console.warn(`BG (onUpdated): Could not send empty APPLY_MAP to tab ${tabId} (TLD ${tld}) to clear theme. Error: ${(error as Error).message}`);
      }
    }
  }
});

browser.contextMenus.create({
  id: "open-options",
  title: "Themer Options",
  contexts: ["browser_action"]
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "open-options") {
    browser.runtime.openOptionsPage();
  }
});