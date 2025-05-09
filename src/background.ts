// background.ts
import type { ColorMap } from "./types";

console.log("BG: Background script loaded at", new Date().toISOString());

const STORAGE_KEYS = {
  SAVED_PALETTES_BY_TLD: "savedPalettesByTld",
  TLD_ACTIVE_SETTINGS: "tldActiveSettings",
  PROVIDER_SETTINGS: ["provider", "ollamaUrl", "openaiKey", "claudeKey"],
  CURRENT_PALETTE: "currentPalette"
};

type TrackedStyleProperties = {
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderTopColor?: string;
  borderRightColor?: string;
  borderBottomColor?: string;
  borderLeftColor?: string;
  // Add any other properties you might track here
};

const originalInlineStyles = new Map<HTMLElement, TrackedStyleProperties>();
let currentObserver: MutationObserver | null = null;
let isCurrentlyThemed = false;

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

function clearAppliedStyles() {
  console.log("CS: Clearing previously applied styles.");
  if (currentObserver) {
    currentObserver.disconnect();
    currentObserver = null;
  }
  originalInlineStyles.forEach((origStyles, element) => {
    if (!document.body || !document.body.contains(element)) {
      return;
    }
    // Restore original inline styles
    if (origStyles.color !== undefined) element.style.color = origStyles.color;
    if (origStyles.backgroundColor !== undefined) element.style.backgroundColor = origStyles.backgroundColor;
    if (origStyles.borderColor !== undefined) element.style.borderColor = origStyles.borderColor;
    if (origStyles.borderTopColor !== undefined) element.style.borderTopColor = origStyles.borderTopColor;
    if (origStyles.borderRightColor !== undefined) element.style.borderRightColor = origStyles.borderRightColor;
    if (origStyles.borderBottomColor !== undefined) element.style.borderBottomColor = origStyles.borderBottomColor;
    if (origStyles.borderLeftColor !== undefined) element.style.borderLeftColor = origStyles.borderLeftColor;
  });
  originalInlineStyles.clear();
  isCurrentlyThemed = false;
}

function collectColors(): string[] {
  const colors = new Set<string>();
  if (!document.body) return [];

  const treeWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let node: Element | null;
  while ((node = treeWalker.nextNode() as Element | null)) {
    if (node.id === "color-rewriter-style" || node.id === "color-rewriter-root-style" || node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.tagName === 'NOSCRIPT') continue;
    const cs = getComputedStyle(node);
    const propsToCollect: (keyof CSSStyleDeclaration)[] = ["color", "backgroundColor", "borderColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor"];
    propsToCollect.forEach(prop => {
      const colorValue = cs.getPropertyValue(prop as string);
      if (colorValue && colorValue !== "transparent" && colorValue !== "rgba(0, 0, 0, 0)" && colorValue !== "none" && !colorValue.startsWith("var(")) {
        colors.add(colorValue);
      }
    });
  }
  // Explicitly add html element's colors if not already picked up or if body is transparent
  if (document.documentElement) {
    const csHtml = getComputedStyle(document.documentElement);
    const propsToCollectHtml: (keyof CSSStyleDeclaration)[] = ["color", "backgroundColor"];
    propsToCollectHtml.forEach(prop => {
      const colorValue = csHtml.getPropertyValue(prop as string);
      if (colorValue && colorValue !== "transparent" && colorValue !== "rgba(0, 0, 0, 0)" && colorValue !== "none" && !colorValue.startsWith("var(")) {
        colors.add(colorValue);
      }
    });
  }
  return [...colors];
}

function applyColorMap(colorMap: ColorMap): void {
  console.log(`CS (applyColorMap): Called. Received map with ${Object.keys(colorMap).length} keys. First few:`, Object.entries(colorMap).slice(0,3).map(([k,v]) => `${k}=>${v}`).join(', '));
  if (Object.keys(colorMap).length < 10) { // Log smaller maps fully for easier debugging
    console.log("CS: Full colorMap:", colorMap);
  }
  clearAppliedStyles(); 
  if (Object.keys(colorMap).length === 0) {
    console.log("CS: Empty color map. Styles have been cleared. No new theme applied.");
    return; 
  }
  isCurrentlyThemed = true;
  console.log("CS: Applying new color map.");
  function processElement(element: Element) {
    if (!(element instanceof HTMLElement) || element.tagName === 'SCRIPT' || element.tagName === 'STYLE' || element.tagName === 'NOSCRIPT') {
      return;
    }
    const htmlElement = element as HTMLElement;
    const computedStyle = getComputedStyle(htmlElement);

    const propertiesToProcess: { computed: string, inlineProp: keyof TrackedStyleProperties }[] = [
      { computed: computedStyle.color, inlineProp: 'color' },
      { computed: computedStyle.backgroundColor, inlineProp: 'backgroundColor' },
      { computed: computedStyle.borderColor, inlineProp: 'borderColor' },
      { computed: computedStyle.borderTopColor, inlineProp: 'borderTopColor' },
      { computed: computedStyle.borderRightColor, inlineProp: 'borderRightColor' },
      { computed: computedStyle.borderBottomColor, inlineProp: 'borderBottomColor' },
      { computed: computedStyle.borderLeftColor, inlineProp: 'borderLeftColor' },
    ];
    const originalStylesForThisElement = originalInlineStyles.get(htmlElement) || {};
    let modifiedOriginals = false;

    propertiesToProcess.forEach(item => {
      const newColor = colorMap[item.computed];
      // --- Start Added Logging ---
      if (item.inlineProp === 'backgroundColor' && (htmlElement === document.body || htmlElement === document.documentElement)) {
        console.log(`CS_DEBUG: BGColor Check for ${htmlElement.tagName}:`);
        console.log(`  > Original Computed BG: '${item.computed}'`);
        console.log(`  > Is in colorMap? : ${item.computed && colorMap.hasOwnProperty(item.computed)}`);
        console.log(`  > Mapped to (newColor): '${newColor}'`);
      }
      // --- End Added Logging ---
      if (newColor && item.computed !== newColor) {
        if (originalStylesForThisElement[item.inlineProp] === undefined) {
          originalStylesForThisElement[item.inlineProp] = htmlElement.style[item.inlineProp as any] || ""; 
          modifiedOriginals = true;
        }
        htmlElement.style.setProperty(item.inlineProp as string, newColor, 'important');
        // --- Start Added Logging ---
        if (item.inlineProp === 'backgroundColor' && (htmlElement === document.body || htmlElement === document.documentElement)) {
          console.log(`CS_DEBUG: Applied BGColor to ${htmlElement.tagName}: '${newColor}' (was '${item.computed}')`);
        }
        // --- End Added Logging ---
      }
    });

    if (modifiedOriginals) {
      originalInlineStyles.set(htmlElement, originalStylesForThisElement);
    }
  }
  // Process html and body elements first for clarity in logs
  if (document.documentElement) processElement(document.documentElement);
  if (document.body) {
    processElement(document.body);
    document.querySelectorAll('body *').forEach(el => processElement(el)); // Then descendants
  }
  currentObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          processElement(node as Element);
          (node as Element).querySelectorAll('*').forEach(childEl => processElement(childEl));
        }
      });
    });
  });
  if (document.documentElement) {
    currentObserver.observe(document.documentElement, { childList: true, subtree: true });
  }  
  console.log("CS: Color map applied and observer set up.");
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(`CS: Received message: ${message.type} from sender:`, sender.tab ? `tab ${sender.tab.id}`: (sender.id || 'popup/background'));
  if (message.type === "APPLY_MAP") {
    console.log(`CS (APPLY_MAP handler): Received APPLY_MAP. Payload items: ${message.payload ? Object.keys(message.payload).length : '(no payload)'}. Applying...`);
    applyColorMap(message.payload);
    sendResponse({success: true});
    return true; 
  }
  if (message.type === "GET_COLORS") {
    const colors = collectColors();
    console.log("CS (GET_COLORS handler): Sending colors:", colors.length);
    sendResponse({colors: colors});
    return true; 
  }
  console.warn("CS: Unknown message type received by content script:", message.type);
  return false; 
});

async function applyInitialTheme() {
  try {
    console.log("CS (applyInitialTheme): Function called. Requesting initial theme settings from background.");
    const activeSettings = await browser.runtime.sendMessage({ type: "GET_ACTIVE_SETTINGS_FOR_TLD" });
    console.log("CS (applyInitialTheme): Received response for GET_ACTIVE_SETTINGS_FOR_TLD:", activeSettings ? `${activeSettings.style}, palette items: ${Object.keys(activeSettings.palette || {}).length}` : 'null');
    if (activeSettings && activeSettings.palette && Object.keys(activeSettings.palette).length > 0) {
      console.log(`CS (applyInitialTheme): Applying initial theme for TLD. Style: ${activeSettings.style}, Palette items: ${Object.keys(activeSettings.palette).length}.`);
      applyColorMap(activeSettings.palette);
    } else {
      console.log("CS (applyInitialTheme): No active theme (or empty/no palette) found for this TLD. Ensuring styles are cleared by applying empty map.");
      applyColorMap({}); 
    }
  } catch (error) {
    console.error("CS (applyInitialTheme): Error during execution:", error);
    if ((error as Error).message.includes("Receiving end does not exist")) {
      console.warn("CS (applyInitialTheme): Background script might not have been ready during sendMessage.");
    }
  }
}

if (document.readyState === "loading") { 
  document.addEventListener("DOMContentLoaded", () => {  
    if (document.body) {
      console.log("CS: DOMContentLoaded. Sending initial COLOR_SET and calling applyInitialTheme.");
      browser.runtime.sendMessage({ type: "COLOR_SET", payload: collectColors() }).catch(e => console.error("CS: Error sending initial COLOR_SET (DOMContentLoaded):", e));
      applyInitialTheme(); 
    } else {
      console.warn("CS (DOMContentLoaded): Body not available for COLOR_SET.");
    }
  });
} else { 
  if (document.body) {
    console.log("CS: Document already loaded/interactive. Sending initial COLOR_SET and calling applyInitialTheme.");
    browser.runtime.sendMessage({ type: "COLOR_SET", payload: collectColors() }).catch(e => console.error("CS: Error sending initial COLOR_SET (already loaded):", e));
    applyInitialTheme(); 
  } else {
    console.warn("CS (already loaded): Body not yet available for initial COLOR_SET. Will attempt applyInitialTheme anyway.");
    applyInitialTheme(); 
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
  title: "Themer Options", // Changed title slightly
  contexts: ["browser_action"]
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "open-options") {
    browser.runtime.openOptionsPage();
  }
});