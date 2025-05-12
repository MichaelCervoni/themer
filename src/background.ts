// background.ts
import type { ColorMap } from "./types";
import { isLightColor, getDarkerVersion, hexToRgb, getLuminance, getContrastRatio } from "./utils/color-utils";
import { fetchFromOllama } from "./api/ollama-api";
import { fetchFromOpenAI } from "./api/openai-api";
import { fetchFromClaude } from "./api/claude-api";

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
    const paletteCacheKey = getPaletteCacheKey(settings.style, settings.customDescription);    
    if (savedPalettesByTld[tld]?.[paletteCacheKey]) {
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

// Helper function to find a suitable replacement color from the current palette
function findBestReplacementFromPalette(
  currentColorMap: ColorMap,
  targetLightness: 'light' | 'dark'
): string | null {
  let bestCandidate: string | null = null;
  // For 'light' target, we want highest luminance. For 'dark', lowest.
  let bestScore: number = targetLightness === 'light' ? -1 : 2;

  for (const mappedColor of Object.values(currentColorMap)) {
    if (!mappedColor || !mappedColor.startsWith('#')) continue; // Process only valid hex colors

    try {
      const rgb = hexToRgb(mappedColor); // Assuming hexToRgb is available
      if (!rgb) continue;

      const luminance = getLuminance(rgb[0], rgb[1], rgb[2]); // Assuming getLuminance is available

      if (targetLightness === 'light') {
        // Check if color is light (luminance > 0.5, or use your isLightColor logic)
        // and if it's 'lighter' than current best candidate
        if (luminance > 0.5 && luminance > bestScore) {
          bestScore = luminance;
          bestCandidate = mappedColor;
        }
      } else { // targetLightness === 'dark'
        // Check if color is dark (luminance <= 0.5)
        // and if it's 'darker' than current best candidate
        if (luminance <= 0.5 && luminance < bestScore) {
          bestScore = luminance;
          bestCandidate = mappedColor;
        }
      }
    } catch (e) {
      // console.warn(`BG: Could not process color ${mappedColor} for replacement search:`, e);
    }
  }
  return bestCandidate;
}

// Updated function to fix contrast issues
function fixContrastIssues(colorMap: ColorMap, semantics?: any): ColorMap {
  if (!semantics?.relationships?.length) {
    // console.log("BG (fixContrastIssues): No relationships to process.");
    return colorMap;
  }

  const fixedMap = { ...colorMap };
  // console.log("BG (fixContrastIssues): Starting contrast checks on relationships.");

  semantics.relationships.forEach((rel: ColorRelationship) => {
    const originalTextColor = rel.text;
    const originalBgColorString = rel.background;

    let mappedTextColor = fixedMap[originalTextColor];
    let effectiveMappedBgColor: string | undefined;

    if (rel.transparent && semantics.trueBackgrounds) {
      const actualOriginalUnderlyingBg = semantics.trueBackgrounds[originalBgColorString];
      if (actualOriginalUnderlyingBg && fixedMap[actualOriginalUnderlyingBg]) {
        effectiveMappedBgColor = fixedMap[actualOriginalUnderlyingBg];
      } else {
        effectiveMappedBgColor = fixedMap[originalBgColorString];
      }
    } else {
      effectiveMappedBgColor = fixedMap[originalBgColorString];
    }

    if (mappedTextColor && effectiveMappedBgColor && mappedTextColor.startsWith('#') && effectiveMappedBgColor.startsWith('#')) {
      try {
        const textRGB = hexToRgb(mappedTextColor);
        const bgRGB = hexToRgb(effectiveMappedBgColor);

        if (!textRGB || !bgRGB) return;

        const contrast = getContrastRatio(textRGB, bgRGB); // Assuming getContrastRatio is available

        if (contrast < 4.5) {
          console.warn(`BG (fixContrastIssues): Contrast issue for element '${rel.element}'. Text "${mappedTextColor}" (from "${originalTextColor}") on BG "${effectiveMappedBgColor}" (from "${originalBgColorString}"). Contrast: ${contrast.toFixed(2)}:1`);

          const bgIsEffectivelyLight = isLightColor(effectiveMappedBgColor); // Assuming isLightColor is available
          let replacementTextColor: string | null = null;

          if (bgIsEffectivelyLight) { // Background is light, text needs to be dark
            replacementTextColor = findBestReplacementFromPalette(fixedMap, 'dark');
            if (!replacementTextColor) {
              replacementTextColor = "#121212"; // Ultimate fallback if no suitable dark color in palette
              console.warn(`BG (fixContrastIssues): No suitable dark color in palette. Falling back to ${replacementTextColor}.`);
            }
          } else { // Background is dark, text needs to be light
            replacementTextColor = findBestReplacementFromPalette(fixedMap, 'light');
            if (!replacementTextColor) {
              replacementTextColor = "#E0E0E0"; // Ultimate fallback if no suitable light color in palette
              console.warn(`BG (fixContrastIssues): No suitable light color in palette. Falling back to ${replacementTextColor}.`);
            }
          }

          if (replacementTextColor && replacementTextColor !== mappedTextColor) {
            fixedMap[originalTextColor] = replacementTextColor;
            console.log(`BG (fixContrastIssues): Corrected. New text color for "${originalTextColor}" on element '${rel.element}' is "${replacementTextColor}".`);
          } else if (replacementTextColor === mappedTextColor) {
            console.log(`BG (fixContrastIssues): Attempted correction for "${originalTextColor}" on '${rel.element}', but best replacement ("${replacementTextColor}") is same as current. No change.`);
          } else {
             console.log(`BG (fixContrastIssues): Attempted correction for "${originalTextColor}" on '${rel.element}', but no suitable replacement found from palette and no fallback triggered. No change to text color "${mappedTextColor}".`);
          }
        }
      } catch (e) {
        console.error(`BG (fixContrastIssues): Error during contrast post-processing for relationship (text: ${originalTextColor}, bg: ${originalBgColorString}, element: ${rel.element}):`, e);
      }
    }
  });
  // console.log("BG (fixContrastIssues): Finished contrast checks.");
  return fixedMap;
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
    
    // Add true background information
    if (semantics?.trueBackgrounds && Object.keys(semantics.trueBackgrounds).length > 0) {
      semanticInfo += "True backgrounds for transparent elements:\n";
      Object.entries(semantics.trueBackgrounds).forEach(([transparent, realBg]) => {
        semanticInfo += `- ${transparent} actually shows as ${realBg}\n`;
      });
    }
    
    // Add color relationships
    if (semantics?.relationships?.length > 0) {
      semanticInfo += "Color relationships (colors that need good contrast):\n";
      semantics.relationships.forEach((rel: ColorRelationship, i: number) => {
        semanticInfo += `- Text "${rel.text}" on background "${rel.background}" (${rel.element})\n`;
      });
    }
  }
  
  // Add specific guidance for dark/light modes
  let themeGuidance = "";
  
  if (isDarkMode || style.toLowerCase().includes('dark') || style.toLowerCase().includes('black') || style.toLowerCase().includes('neon')) {
    themeGuidance = `
CRITICAL: This is a dark theme. Follow these WCAG accessibility rules STRICTLY:
1. ALL background colors must be dark (#000000 to #333333 range)
2. ALL text colors must be very light (#E0E0E0 to #FFFFFF) or bright neon
3. NEVER map any text color to anything darker than #AAAAAA
4. NEVER use similar colors for text and its background
5. Maintain AT LEAST 4.5:1 contrast ratio between ANY text and ANY background
6. The darker the background, the brighter the text must be
7. If instructed to create a "neon" theme, use bright neon colors ONLY for text and accents, NEVER for large backgrounds

When making color decisions:
- Text that was originally dark → Make very bright (#FFFFFF, #E0E0E0) or neon (#00FFFF, #39FF14, etc.)
- Text that was originally light → Keep light or make neon
- Backgrounds that were originally light → Make very dark (#0A0A0A, #121212)
- Backgrounds that were originally dark → Keep dark or make slightly lighter
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

Given these colors: ${JSON.stringify(colors)}
And the desired style "${style}${customDesc ? `: ${customDesc}` : ''}",
Colors should be mapped to the new style while maintaining contrast and readability. If the starting theme is light, most colors that are light should be replaced with darker colors, and vice versa.
Pay close attention to the color relationships and ensure that text colors are readable against their backgrounds.
Return ONLY a JSON object mapping each original color (as given) to a hex replacement. Example: {"rgb(255, 0, 0)": "#FF0000", "blue": "#0000FF"}`;
  
  console.log(`BG (fetchPalette): Sending prompt: ${prompt}`);
  console.log(`BG (fetchPalette): Provider settings:`, providerSettings);
  let colorMap: ColorMap;
  
  switch(provider) {
    case "openai":
      colorMap = await fetchFromOpenAI(colors, style, customDesc, providerSettings.openaiKey, prompt);
      break;
    case "claude":
      colorMap = await fetchFromClaude(colors, style, customDesc, providerSettings.claudeKey, prompt);
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

  // Ensure specific mappings exist for common values
  if (isDarkMode) {
    // Add mappings for white/transparent if not already present
    if (!colorMap["rgb(255, 255, 255)"]) colorMap["rgb(255, 255, 255)"] = "#121212";
    if (!colorMap["#FFFFFF"]) colorMap["#FFFFFF"] = "#121212";
    if (!colorMap["#FFF"]) colorMap["#FFF"] = "#121212";
    if (!colorMap["white"]) colorMap["white"] = "#121212";
    if (!colorMap["rgba(0, 0, 0, 0)"]) colorMap["rgba(0, 0, 0, 0)"] = "#121212";
    if (!colorMap["transparent"]) colorMap["transparent"] = "#121212";
    
    console.log("BG (fetchPalette): Added missing mappings for white/transparent in dark mode");
  }

  // Apply the new contrast fixing logic
  // This should come AFTER the AI has generated the map and AFTER basic dark mode adjustments for backgrounds.
  console.log("BG (fetchPalette): Applying contrast fixing based on semantic relationships.");
  colorMap = fixContrastIssues(colorMap, semantics);
  
  return colorMap;
}

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
    const urlForTld = sender.tab?.url || message.url; 
    if (!urlForTld) {
      console.error("BG (GET_ACTIVE_SETTINGS_FOR_TLD): URL is missing.");
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

  // Add this to your existing message listener
  if (message.type === "CONTENT_SCRIPT_LOADED") {
    console.log(`BG: Content script loaded notification from ${message.url}`);
    return Promise.resolve({success: true});
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

try {
  if (browser.contextMenus) {
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
  }
} catch (e) {
  console.warn("BG: Context menus API not available:", e);
}

// Add this interface near the top of your background.ts file
interface ColorRelationship {
  text: string;
  background: string;
  element: string;
  transparent: boolean;
}
