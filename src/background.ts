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
    
    const semantics = response.semantics || {};
    console.log(`BG (handleRefreshPalette): Received ${response.colors.length} colors for TLD ${tld}. Style: ${settings.style}`);
    if (semantics.backgroundColors) {
      console.log(`BG (handleRefreshPalette): Semantic information available - Background colors: ${semantics.backgroundColors.length}`);
    }
    
    let colorMap: ColorMap;
    const paletteCacheKey = getPaletteCacheKey(settings.style, settings.customDescription);    if (savedPalettesByTld[tld]?.[paletteCacheKey]) {
      console.log(`BG (handleRefreshPalette): Using saved palette for TLD ${tld}, Key: ${paletteCacheKey}`);
      colorMap = savedPalettesByTld[tld][paletteCacheKey];
      
      // Ensure background colors are properly handled even for saved palettes
      if (settings.style.toLowerCase().includes('dark') && semantics?.backgroundColors) {
        console.log("BG: Verifying dark mode backgrounds in saved palette");
        let modified = false;
        
        semantics.backgroundColors.forEach((bgColor: string) => {
          // If background color doesn't have a mapping or maps to a light color
          if (!colorMap[bgColor] || 
              (colorMap[bgColor] && !colorMap[bgColor].match(/#[0-2][0-2][0-2]/))) {
            colorMap[bgColor] = '#121212'; // Force dark background
            modified = true;
          }
        });
        
        // Save the modified palette if changed
        if (modified) {
          savedPalettesByTld[tld][paletteCacheKey] = colorMap;
          await browser.storage.local.set({ [STORAGE_KEYS.SAVED_PALETTES_BY_TLD]: savedPalettesByTld });
          console.log("BG: Updated saved dark mode palette with corrected backgrounds");
        }
      }
    } else {
      console.log(`BG (handleRefreshPalette): No saved palette for TLD ${tld}, Key: ${paletteCacheKey}. Fetching new.`);
      try {
        // Pass semantic information to the fetchPalette function
        colorMap = await fetchPalette(
          response.colors, 
          settings.style, 
          settings.customDescription,
          undefined,
          undefined, 
          semantics
        );
        
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

async function fetchPalette(colors: string[], style: string, customDesc?: string, apiKey?: string, baseUrl?: string, semantics?: any): Promise<ColorMap> {
  const providerSettings = await browser.storage.local.get(STORAGE_KEYS.PROVIDER_SETTINGS);
  const provider = providerSettings.provider || "openai"; // Default to OpenAI instead of Ollama
  console.log(`BG (fetchPalette): Using provider: ${provider}. Style: ${style}`);
  
  // Build a more intelligent prompt using semantic information when available
  let semanticInfo = "";
  let isDarkMode = style.toLowerCase().includes("dark");
  let isLightMode = style.toLowerCase().includes("light");
  
  // Extract semantic information if available
  const backgroundColors = semantics?.backgroundColors || [];
  const textColors = semantics?.textColors || [];
  const borderColors = semantics?.borderColors || [];
  const accentColors = semantics?.accentColors || [];
  const linkColors = semantics?.linkColors || [];
  
  if (backgroundColors.length || textColors.length) {
    semanticInfo = "\nImportant semantic color information:\n";
    
    if (backgroundColors.length) {
      semanticInfo += `Background colors: ${JSON.stringify(backgroundColors.slice(0, 5))}\n`;
    }
    
    if (textColors.length) {
      semanticInfo += `Text colors: ${JSON.stringify(textColors.slice(0, 5))}\n`;
    }
    
    if (borderColors.length) {
      semanticInfo += `Border colors: ${JSON.stringify(borderColors.slice(0, 3))}\n`;
    }
    
    if (accentColors.length) {
      semanticInfo += `Accent colors: ${JSON.stringify(accentColors.slice(0, 3))}\n`;
    }
    
    if (linkColors.length) {
      semanticInfo += `Link colors: ${JSON.stringify(linkColors.slice(0, 3))}\n`;
    }
  }
  
  // Add specific guidance for dark/light modes
  let themeGuidance = "";
  
  if (isDarkMode) {
    themeGuidance = `
CRITICAL: This is a dark theme. Follow these rules strictly:
1. ALL background colors must be dark (e.g. #121212, #1A1A1A, #242424)
2. Text colors must be light (e.g. #E0E0E0, #CCCCCC)
3. Primary background colors MUST be very dark (around #121212-#191919)
4. Maintain contrast ratios to ensure readability
5. If original backgrounds are light, they MUST be mapped to dark colors
`;
  } 
  else if (isLightMode) {
    themeGuidance = `
CRITICAL: This is a light theme. Follow these rules strictly:
1. ALL background colors must be light (e.g. #FFFFFF, #F5F5F5, #F0F0F0)
2. Text colors should be dark (e.g. #121212, #333333)
3. Primary background colors MUST be very light (white or near-white)
4. Maintain contrast ratios to ensure readability
`;
  }
  
  const prompt = `You are a color replacement assistant. You will be given a list of colors (in various formats like hex, rgb, rgba, hsl) and a style. Your task is to return ONLY a JSON object mapping each original color to a new color in HEX format. Preserve the general contrast relationships.

${semanticInfo}${themeGuidance}

Given these colors: ${JSON.stringify(colors.slice(0, 100))}
And the desired style "${style}${customDesc ? `: ${customDesc}` : ''}",
Return ONLY a JSON object mapping each original color (as given) to a hex replacement. Example: {"rgb(255, 0, 0)": "#FF0000", "blue": "#0000FF"}`;
  
  console.log(`BG (fetchPalette): Sending prompt (first 100 chars): ${prompt.substring(0, 100)}...`);

  let colorMap: ColorMap;
  
  switch(provider) {
    case "openai":
      colorMap = await fetchFromOpenAI(colors, style, customDesc, providerSettings.openaiKey || apiKey, prompt);
      break;
    case "claude":
      colorMap = await fetchFromClaude(colors, style, customDesc, providerSettings.claudeKey || apiKey, prompt);
      break;
    case "ollama":
    default:
      colorMap = await fetchFromOllama(colors, style, customDesc, providerSettings.ollamaUrl || baseUrl, prompt);
      break;
  }
    // Post-process the color map for dark mode to ensure backgrounds are dark
  if (isDarkMode && backgroundColors.length) {
    console.log("BG: Post-processing dark theme to ensure backgrounds are dark");
    for (const bgColor of backgroundColors) {
      const mappedColor = colorMap[bgColor];
      if (mappedColor) {
        // Check if the mapped color is light
        try {
          const isLight = isLightColor(mappedColor);
          if (isLight) {
            console.log(`BG: Replacing light background color ${mappedColor} with dark alternative`);
            colorMap[bgColor] = getDarkerVersion(mappedColor);
          }
        } catch (e) {
          // If we can't parse the color, keep the original mapping
        }
      } else {
        // If background color wasn't mapped, add a default dark mapping
        colorMap[bgColor] = "#121212";
      }
    }
  }
  
  return colorMap;
}

/**
 * Check if a color is light based on its brightness
 */
function isLightColor(color: string): boolean {
  try {
    let r = 0, g = 0, b = 0;
    
    if (color.startsWith('#')) {
      const hex = color.replace('#', '');
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    } else if (color.startsWith('rgb')) {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
        r = parseInt(match[1]);
        g = parseInt(match[2]);
        b = parseInt(match[3]);
      }
    }
    
    // Calculate perceived brightness
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128; // Above 128 is considered light
  } catch (e) {
    return false; // If we can't determine, assume it's not light
  }
}

/**
 * Get a darker version of a color
 */
function getDarkerVersion(color: string): string {
  try {
    let r = 0, g = 0, b = 0;
    
    if (color.startsWith('#')) {
      const hex = color.replace('#', '');
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    } else if (color.startsWith('rgb')) {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
        r = parseInt(match[1]);
        g = parseInt(match[2]);
        b = parseInt(match[3]);
      }
    }
    
    // Make the color darker by reducing each component
    r = Math.max(r * 0.3, 0);
    g = Math.max(g * 0.3, 0);
    b = Math.max(b * 0.3, 0);
    
    // Convert back to hex
    return `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`;
  } catch (e) {
    return "#121212"; // If we can't parse the color, return a default dark color
  }
}

async function fetchFromOllama(colors: string[], style: string, customDesc?: string, ollamaBaseUrlFromSettings?: string, prompt?: string): Promise<ColorMap> {
  // Helper function that creates a mock palette when Ollama isn't available
  const createMockPalette = (): ColorMap => {
    console.log("BG (fetchFromOllama): Creating mock color palette");
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
    return mockResponse;
  };

  // Use debug mode if explicitly requested
  if (ollamaBaseUrlFromSettings === "debug") {
    console.log("BG (fetchFromOllama): DEBUG MODE - Using mock color palette");
    return Promise.resolve(createMockPalette());
  }
  
  // Get a compatible model from available models
  async function getCompatibleModel(baseUrl: string): Promise<string> {
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`);
      if (!response.ok) {
        return "llama3"; // Default fallback
      }
      
      const data = await response.json();
      console.log("BG (getCompatibleModel): Available models:", data.models?.map((m: any) => m.name).join(", ") || "none found");
      
      // Try to find a suitable model in order of preference
      const preferredModels = [
        "llama3", "llama3:8b", "llama3:70b", 
        "llama2", "llama2:7b", "llama2:13b", "llama2:70b",
        "gemma", "gemma:7b", "gemma:2b", "gemma3", "gemma3:8b",
        "mistral", "mistral:7b", "mixtral", "phi", "phi:3b"
      ];
      
      if (Array.isArray(data.models)) {
        const availableModels = data.models.map((m: any) => m.name.toLowerCase());
        for (const model of preferredModels) {
          if (availableModels.includes(model) || availableModels.some((m: string) => m.startsWith(model))) {
            console.log(`BG (getCompatibleModel): Selected ${model} from available models`);
            return model;
          }
        }
        
        // If none of the preferred models are available, use the first available model
        if (data.models.length > 0) {
          console.log(`BG (getCompatibleModel): Using first available model: ${data.models[0].name}`);
          return data.models[0].name;
        }
      }
      
      return "llama3"; // Default fallback if no models found
    } catch (error) {
      console.error("BG (getCompatibleModel): Error getting available models:", error);
      return "llama3"; // Default fallback
    }
  }

  const baseOllamaUrl = ollamaBaseUrlFromSettings || "http://127.0.0.1:11434";
  const OLLAMA_API_URL = `${baseOllamaUrl.replace(/\/$/, '')}/api/chat`;
  console.log(`BG (fetchFromOllama): Attempting to fetch from Ollama API: ${OLLAMA_API_URL}`);
  
  // If the fetch fails, the user will see an error. Add this to check - the user might want to try debug mode first
  if (baseOllamaUrl !== "debug" && colors.length > 0) {
    console.log("BG (fetchFromOllama): Will create temporary mock palette if Ollama fails");
  }
  
  try {
    // First check if Ollama server is running with a simpler request
    console.log(`BG (fetchFromOllama): Testing connection to Ollama server: ${baseOllamaUrl}/api/tags`);
    
    // Get a compatible model via the same mechanism as our utility function
    let modelToUse = "llama3"; // Default model
    
    try {
      // Direct fetch without CORS/proxy since we're in background script
      const checkResponse = await fetch(`${baseOllamaUrl.replace(/\/$/, '')}/api/tags`, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      
      if (!checkResponse.ok) {
        console.error(`BG (fetchFromOllama): Ollama server returned status ${checkResponse.status} during connectivity check`);
        const errorBody = await checkResponse.text().catch(() => "Failed to read error body");
        console.error(`BG (fetchFromOllama): Error body: ${errorBody}`);
        throw new Error(`Ollama server returned status ${checkResponse.status} - ${errorBody}`);
      }
      
      const data = await checkResponse.json();
      
      if (data.models && Array.isArray(data.models) && data.models.length > 0) {
        // Find a suitable model
        const availableModels = data.models.map((m: any) => m.name);
        const preferredModels = [
          "llama3", "llama3:8b", "llama2:7b", "gemma:7b", "mistral:7b", "mixtral", "phi:3b"
        ];
        
        for (const model of preferredModels) {
          if (availableModels.includes(model) || availableModels.some((m: string) => m.startsWith(model.toLowerCase()))) {
            modelToUse = model;
            break;
          }
        }
        
        if (!preferredModels.includes(modelToUse) && !preferredModels.some(p => modelToUse.startsWith(p))) {
          // If we didn't find a preferred model, use the first available one
          modelToUse = availableModels[0];
        }
      }
      
      console.log(`BG (fetchFromOllama): Ollama server connectivity confirmed, using model: ${modelToUse}`);
    } catch (checkError) {
      console.error("BG (fetchFromOllama): Ollama server connectivity check failed:", checkError);
      // If test connectivity fails, return a mock palette instead of throwing
      console.warn("BG (fetchFromOllama): Falling back to mock palette due to connectivity error");
      return createMockPalette();
    }
    
    // Now send the actual chat request directly from the background script (no CORS issues here)
    console.log(`BG (fetchFromOllama): Sending chat request to: ${OLLAMA_API_URL} using model: ${modelToUse}`);
    const response = await fetch(OLLAMA_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        model: modelToUse,
        messages: [{ role: "user", content: prompt }],
        format: "json",
        stream: false
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`BG (fetchFromOllama): Ollama returned status ${response.status}. Body: ${errorText}`);
      // If the actual request fails, return a mock palette as fallback
      console.warn("BG (fetchFromOllama): Falling back to mock palette due to API error");
      return createMockPalette();
    }
    
    const data = await response.json();
    console.log("BG (fetchFromOllama): Raw LLM response:", data);
    
    if (!data.message) {
      console.error("BG (fetchFromOllama): Unexpected response format. Missing 'message' property:", data);
      if (data.error) {
        throw new Error(`Ollama error: ${data.error}`);
      }
      throw new Error("Unexpected response format from Ollama");
    }
    
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

// Import will be added by bundler - we're using the functions directly
// import { getDevOpenAIKey } from "./utils/dev-keys";

/**
 * Try to get an OpenAI API key from storage (for development)
 */
async function tryGetDevOpenAIKey(): Promise<string | undefined> {
  try {
    const devKeyData = await browser.storage.local.get("DEV_OPENAI_KEY");
    return devKeyData.DEV_OPENAI_KEY || undefined;
  } catch (e) {
    console.warn("BG: Error checking for development API key", e);
    return undefined;
  }
}

async function fetchFromOpenAI(colors: string[], style: string, customDesc?: string, apiKey?: string, prompt?: string): Promise<ColorMap> {
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
    if (message.type === "OLLAMA_PROXY") {
    console.log("BG (OLLAMA_PROXY): Proxying request to Ollama:", {
      url: message.url,
      method: message.method || "GET",
      headers: message.headers,
      bodyLength: message.body ? JSON.stringify(message.body).length : 0
    });
    
    try {
      // More detailed debugging for the Ollama proxy
      console.log(`BG (OLLAMA_PROXY): Full request details:
        URL: ${message.url}
        Method: ${message.method || "GET"}
        Headers: ${JSON.stringify(message.headers || { "Accept": "application/json" })}
        Body sample: ${message.body ? JSON.stringify(message.body).substring(0, 100) + '...' : 'none'}`);
      
      const requestBody = message.body ? 
        (typeof message.body === 'string' ? message.body : JSON.stringify(message.body)) : 
        undefined;
      
      const response = await fetch(message.url, {
        method: message.method || "GET",
        headers: message.headers || { "Accept": "application/json" },
        body: requestBody
      });
      
      console.log(`BG (OLLAMA_PROXY): Response received. Status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`BG (OLLAMA_PROXY): Error response: ${response.status} ${response.statusText}`, errorText);
        return {
          success: false,
          ok: false,
          status: response.status,
          statusText: response.statusText,
          error: errorText
        };
      }
      
      const responseText = await response.text();
      console.log(`BG (OLLAMA_PROXY): Successful response (${responseText.length} chars): ${responseText.substring(0, 100)}...`);
      
      try {
        const responseData = JSON.parse(responseText);
        return {
          success: true,
          ok: true,
          status: response.status,
          data: responseData,
          text: responseText
        };
      } catch (jsonError) {
        console.warn(`BG (OLLAMA_PROXY): Could not parse response as JSON: ${jsonError}`);
        return {
          success: true,
          ok: true, 
          status: response.status,
          text: responseText
        };
      }
    } catch (error) {
      console.error("BG (OLLAMA_PROXY): Fetch error:", error);
      return {
        success: false,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
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

  if (message.type === "OLLAMA_SYSTEM_CHECK") {
    console.log("BG (OLLAMA_SYSTEM_CHECK): Performing system-level check for Ollama connectivity");
    
    try {
      const url = message.url || "http://127.0.0.1:11434/api/tags";
      console.log(`BG (OLLAMA_SYSTEM_CHECK): Testing connection to ${url}`);
      
      // Create an abort controller with timeout for better browser compatibility
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(url, {
        method: "GET",
        headers: { "Accept": "application/json" },
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));
      
      const responseText = await response.text();
      console.log(`BG (OLLAMA_SYSTEM_CHECK): Response status: ${response.status}, text length: ${responseText.length}`);
      
      try {
        const data = JSON.parse(responseText);
        return {
          success: true,
          status: response.status,
          statusText: response.statusText,
          data: data,
          text: responseText,
          models: data.models?.map((m: any) => m.name) || []
        };
      } catch (jsonError) {
        return {
          success: true,
          status: response.status,
          statusText: response.statusText,
          error: `Failed to parse JSON: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`,
          text: responseText
        };
      }
    } catch (error) {
      console.error("BG (OLLAMA_SYSTEM_CHECK): Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  if (message.type === "NETWORK_DIAGNOSTICS") {
    console.log("BG (NETWORK_DIAGNOSTICS): Running comprehensive network tests");
    const url = message.url || "http://127.0.0.1:11434/api/tags";
    
    try {
      const results: any = {
        targetUrl: url,
        tests: {}
      };

      // Test 1: Direct fetch to the specified URL
      try {
        console.log(`BG (NETWORK_DIAGNOSTICS): Testing direct fetch to ${url}`);
        const response = await fetch(url, {
          method: "GET",
          headers: { "Accept": "application/json" }
        });
        
        results.tests.directFetch = {
          success: response.ok,
          status: response.status,
          statusText: response.statusText
        };
        
        try {
          const text = await response.text();
          results.tests.directFetch.bodyLength = text.length;
          results.tests.directFetch.bodySample = text.substring(0, 100);
        } catch (err) {
          results.tests.directFetch.bodyError = String(err);
        }
      } catch (error) {
        results.tests.directFetch = {
          success: false,
          error: String(error)
        };
      }

      // Test 2: Try localhost instead of 127.0.0.1 or vice versa
      const alternateHost = url.includes('127.0.0.1') ? 
        url.replace('127.0.0.1', 'localhost') : 
        url.replace('localhost', '127.0.0.1');
      
      try {
        console.log(`BG (NETWORK_DIAGNOSTICS): Testing alternative host: ${alternateHost}`);
        const response = await fetch(alternateHost, {
          method: "GET", 
          headers: { "Accept": "application/json" }
        });
        
        results.tests.alternateHost = {
          url: alternateHost,
          success: response.ok,
          status: response.status,
          statusText: response.statusText
        };
      } catch (error) {
        results.tests.alternateHost = {
          url: alternateHost,
          success: false,
          error: String(error)
        };
      }

      // Test 3: Check internet connectivity
      try {
        console.log("BG (NETWORK_DIAGNOSTICS): Testing general internet connectivity");
        const response = await fetch("https://www.google.com/generate_204", { method: "GET" });
        results.tests.internet = {
          success: response.status === 204,
          status: response.status,
          statusText: response.statusText
        };
      } catch (error) {
        results.tests.internet = {
          success: false,
          error: String(error)
        };
      }

      // Test 4: Extension API access test
      try {
        console.log("BG (NETWORK_DIAGNOSTICS): Testing extension API access");
        const storageResult = await browser.storage.local.get('test-key');
        await browser.storage.local.set({ 'test-key': Date.now() });
        results.tests.extensionAPI = {
          success: true,
          storageAccess: true
        };
      } catch (error) {
        results.tests.extensionAPI = {
          success: false,
          error: String(error)
        };
      }

      console.log("BG (NETWORK_DIAGNOSTICS): Tests completed", results);
      return results;
    } catch (error) {
      console.error("BG (NETWORK_DIAGNOSTICS): Error running tests", error);
      return {
        success: false,
        error: String(error)
      };
    }
  }
  
  if (message.type === "SET_DEV_OPENAI_KEY") {
    try {
      const { key } = message;
      if (!key) {
        return { success: false, error: "No API key provided" };
      }
      
      console.log("BG (SET_DEV_OPENAI_KEY): Storing development OpenAI key");
      await browser.storage.local.set({ DEV_OPENAI_KEY: key });
      
      return { success: true, message: "Development OpenAI API key stored successfully" };
    } catch (error) {
      console.error("BG (SET_DEV_OPENAI_KEY): Error storing key:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error storing key" 
      };
    }
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