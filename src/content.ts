// Add this at the very top of the file
console.log("THEMER CONTENT SCRIPT: Initial load at", new Date().toISOString(), window.location.href);

// Verify browser.runtime is available
console.log("THEMER CONTENT SCRIPT: browser.runtime available:", !!browser.runtime);

// Add this code at the beginning of the file
// This will run immediately when the script loads
(function checkContentScriptExecution() {
  console.log("CS: Content script initialized for", window.location.href);
  // Send a simple ping to the background script to verify communication works
  try {
    browser.runtime.sendMessage({
      type: "CONTENT_SCRIPT_LOADED",
      url: window.location.href
    }).catch(err => console.error("CS: Error sending initial message:", err));
  } catch (e) {
    console.error("CS: Error in initialization:", e);
  }
})();

// content.ts - Runs in the context of web pages
import type { ColorMap } from "./types";

// Import dev console utilities (will be tree-shaken in production)
import * as consoleUtils from './utils/console-utils';

// Define a type for the style properties we are tracking
type TrackedStyleProperties = {
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderTopColor?: string;
  borderRightColor?: string;
  borderBottomColor?: string;
  borderLeftColor?: string;
};

const originalInlineStyles = new Map<HTMLElement, TrackedStyleProperties>();
let currentObserver: MutationObserver | null = null;
let isCurrentlyThemed = false;

/**
 * Helper to detect if a color map represents a dark theme
 */
function isDarkTheme(colorMap: ColorMap): boolean {
  // Count dark colors in the color map
  let darkColorCount = 0;
  let totalColors = 0;
  
  for (const targetColor of Object.values(colorMap)) {
    if (!targetColor) continue;
    totalColors++;
    
    try {
      // Parse color to RGB
      let r = 0, g = 0, b = 0;
      if (targetColor.startsWith('#')) {
        const hex = targetColor.replace('#', '');
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
      } else if (targetColor.startsWith('rgb')) {
        const match = targetColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
          r = parseInt(match[1]);
          g = parseInt(match[2]);
          b = parseInt(match[3]);
        }
      }
      
      // Calculate brightness
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      if (brightness < 80) { // Threshold for "dark" colors
        darkColorCount++;
      }
    } catch (e) {
      // Skip colors that can't be parsed
    }
  }
  
  // If more than 30% of colors are dark, consider it a dark theme
  return totalColors > 0 && (darkColorCount / totalColors) > 0.3;
}

/**
 * Ensure html and body have dark backgrounds in dark mode
 */
function ensureDarkBackgrounds(colorMap: ColorMap): void {
  // Get current background colors
  const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  
  // If we don't have specific mappings for backgrounds, add dark colors
  if (htmlBg && htmlBg !== "rgba(0, 0, 0, 0)" && htmlBg !== "transparent" && !colorMap[htmlBg]) {
    colorMap[htmlBg] = "#121212"; // Dark color for html background
    console.log("CS: Added dark background mapping for HTML:", htmlBg, "→ #121212");
  }
  
  if (bodyBg && bodyBg !== "rgba(0, 0, 0, 0)" && bodyBg !== "transparent" && !colorMap[bodyBg]) {
    colorMap[bodyBg] = "#121212"; // Dark color for body background
    console.log("CS: Added dark background mapping for BODY:", bodyBg, "→ #121212");
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
      originalInlineStyles.delete(element);
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

function applyColorMap(colorMap: ColorMap): void {
  console.log(`CS (applyColorMap): Called. Received map with ${Object.keys(colorMap).length} keys.`);
  if (Object.keys(colorMap).length < 10 && Object.keys(colorMap).length > 0) {
    console.log("CS: Full colorMap:", colorMap);
  }
  
  clearAppliedStyles(); 

  if (Object.keys(colorMap).length === 0) {
    console.log("CS: Empty color map. Styles have been cleared. No new theme applied.");
    return; 
  }
  
  // Check if this is a dark theme
  const isDarkMode = isDarkTheme(colorMap);
  
  // Create a style element for our theme
  const styleElement = document.createElement('style');
  styleElement.id = 'themer-global-styles';
  
  // Start building CSS rules
  let cssRules = [];
  
  // Add universal rules for HTML and BODY in dark mode
  if (isDarkMode) {
    // Get the colors for dark backgrounds and light text
    const darkBg = colorMap["rgb(255, 255, 255)"] || colorMap["#FFFFFF"] || colorMap["#FFF"] || colorMap["white"] || "#121212";
    const lightText = colorMap["rgb(0, 0, 0)"] || colorMap["#000000"] || colorMap["#000"] || colorMap["black"] || "#E0E0E0";
    const transparentBg = colorMap["rgba(0, 0, 0, 0)"] || colorMap["transparent"] || darkBg;
    
    console.log(`CS: Dark mode detected. Using base colors - Background: ${darkBg}, Text: ${lightText}, Transparent: ${transparentBg}`);
    
    // Add basic dark mode styles
    cssRules.push(`
      /* Force dark theme basics */
      html, body {
        background-color: ${darkBg} !important;
        color: ${lightText} !important;
      }
    `);

    // Inside the isDarkMode condition in applyColorMap
    if (isDarkMode) {
      // After the existing html/body styles
      cssRules.push(`
        /* Dark mode fallbacks for text (catch black text not explicitly mapped) */
        p, span, div, h1, h2, h3, h4, h5, h6, a, li, td, th, label, input, textarea {
          color: ${lightText} !important;
        }
        
        /* Handle search input text */
        input[type="text"], input[type="search"], input:not([type]) {
          color: ${lightText} !important;
          background-color: #2A2A2A !important;
        }
        
        /* Force contrast for links */
        a:link, a:visited {
          color: #8CB4FF !important;
        }
      `);

      // Inside the isDarkMode condition in applyColorMap, after dark mode fallbacks
      cssRules.push(`
        /* CSS Variable overrides for dark mode */
        :root {
          --text-color: ${lightText} !important;
          --body-color: ${lightText} !important;
          --body-bg: ${darkBg} !important;
          --bg-color: ${darkBg} !important;
          --background: ${darkBg} !important;
          --background-color: ${darkBg} !important;
          
          /* Material & Bootstrap variables */
          --mat-background-color: ${darkBg} !important;
          --bs-body-bg: ${darkBg} !important;
          --bs-body-color: ${lightText} !important;
        }
      `);
    }
  }
  
  // Add a special section for transparent elements
  if (isDarkMode) {
    const transparentMapping = colorMap["rgba(0, 0, 0, 0)"] || colorMap["transparent"];
    if (transparentMapping) {
      cssRules.push(`
        /* Handle elements with transparent backgrounds */
        [style*="background-color: transparent"],
        [style*="background-color: rgba(0, 0, 0, 0)"],
        [style*="background: transparent"],
        [style*="background: rgba(0, 0, 0, 0)"] {
          background-color: ${transparentMapping} !important;
        }
      `);
    }
  }
  
  // Replace existing attribute selector code
  Object.entries(colorMap).forEach(([origColor, newColor]) => {
    if (!origColor || !newColor) return;
    
    // Clean the color strings for CSS
    const cleanOrig = origColor.replace(/\s+/g, ' ').trim();
    const colorId = origColor.replace(/[^a-z0-9]/gi, '-');
    
    // Add more powerful selectors
    cssRules.push(`
      /* Color replacements for ${cleanOrig} */
      [style*="color: ${cleanOrig}"] { color: ${newColor} !important; }
      [style*="background-color: ${cleanOrig}"] { background-color: ${newColor} !important; }
      [style*="background: ${cleanOrig}"] { background: ${newColor} !important; }
      [style*="border-color: ${cleanOrig}"] { border-color: ${newColor} !important; }
      [style*="border: ${cleanOrig}"] { border-color: ${newColor} !important; }
      
      /* Target elements that might use this color but aren't caught by attribute selectors */
      .themer-force-${colorId} { color: ${newColor} !important; background-color: ${newColor} !important; }
    `);
  });
  
  // Create general type selectors for common elements
  if (isDarkMode) {
    cssRules.push(`
      /* Common element type selectors */
      input, textarea, select, button {
        background-color: #2A2A2A !important;
        color: #E0E0E0 !important;
        border-color: #444 !important;
      }
    `);
  }
  
  // Combine all rules
  styleElement.textContent = cssRules.join('\n');
  
  // Add an observer to make sure our style stays in the document
  const observer = new MutationObserver(() => {
    if (!document.head.contains(styleElement)) {
      console.log("CS: Style element was removed, re-adding it");
      document.head.appendChild(styleElement);
    }
  });
  
  // Add the style element and start observing
  document.head.appendChild(styleElement);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  
  // Save the observer so we can disconnect it later
  currentObserver = observer;
  
  // Apply inline styles to existing elements
  applyInlineStyles(colorMap);
  
  console.log("CS: Global theme styles applied successfully");
}

/**
 * Apply inline styles to elements for more complete coverage
 */
function applyInlineStyles(colorMap: ColorMap): void {
  console.log("CS: Applying inline styles for better coverage");
  
  const elementsToProcess = [
    document.documentElement,
    document.body,
    ...Array.from(document.querySelectorAll('div, main, article, section, header, footer, aside'))
  ];
  
  // Process each element
  elementsToProcess.forEach(element => {
    if (!(element instanceof HTMLElement)) return;
    
    const htmlElement = element as HTMLElement;
    const computedStyle = getComputedStyle(htmlElement);
    
    // Process background color
    const bgColor = computedStyle.backgroundColor;
    const newBgColor = colorMap[bgColor];
    
    if (newBgColor) {
      const origStyle = originalInlineStyles.get(htmlElement) || {};
      if (origStyle.backgroundColor === undefined) {
        origStyle.backgroundColor = htmlElement.style.backgroundColor || "";
      }
      htmlElement.style.setProperty('background-color', newBgColor, 'important');
      originalInlineStyles.set(htmlElement, origStyle);
    }
    
    // Process text color
    const textColor = computedStyle.color;
    const newTextColor = colorMap[textColor];
    
    if (newTextColor) {
      const origStyle = originalInlineStyles.get(htmlElement) || {};
      if (origStyle.color === undefined) {
        origStyle.color = htmlElement.style.color || "";
      }
      htmlElement.style.setProperty('color', newTextColor, 'important');
      originalInlineStyles.set(htmlElement, origStyle);
    }
  });
}

/**
 * Collect all colors from the page
 */
function collectColors(): string[] {
  const colors = new Set<string>();
  if (!document.body) return [];

  const treeWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let node: Element | null;
  
  // First make sure to capture the html and body background colors
  if (document.documentElement) {
    const htmlStyle = getComputedStyle(document.documentElement);
    const bgColor = htmlStyle.backgroundColor;
    if (bgColor && bgColor !== "transparent" && bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "none") {
      colors.add(bgColor);
    }
  }
  
  if (document.body) {
    const bodyStyle = getComputedStyle(document.body);
    const bgColor = bodyStyle.backgroundColor;
    if (bgColor && bgColor !== "transparent" && bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "none") {
      colors.add(bgColor);
    }
  }
  
  // Then process all other elements
  while ((node = treeWalker.nextNode() as Element | null)) {
    if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.tagName === 'NOSCRIPT') continue;

    const cs = getComputedStyle(node);
    const propsToCollect: (keyof CSSStyleDeclaration)[] = ["color", "backgroundColor", "borderColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor"];
    
    propsToCollect.forEach(prop => {
      const colorValue = cs.getPropertyValue(prop as string);
      if (colorValue && colorValue !== "transparent" && colorValue !== "rgba(0, 0, 0, 0)" && colorValue !== "none" && !colorValue.startsWith("var(")) {
        colors.add(colorValue);
      }
    });
  }
  
  console.log(`CS (collectColors): Collected ${colors.size} unique colors.`);
  return [...colors];
}

// Add after collectColors() function (around line 285)
/**
 * Extract colors from all accessible stylesheets
 */
function extractColorsFromStylesheets(): Set<string> {
  const extractedColors = new Set<string>();
  
  try {
    // Process all stylesheets
    for (let i = 0; i < document.styleSheets.length; i++) {
      try {
        const sheet = document.styleSheets[i];
        
        // Skip cross-origin stylesheets we can't access
        if (sheet.href && !sheet.href.startsWith(window.location.origin) && !sheet.href.startsWith('moz-extension://')) {
          continue;
        }
        
        // Access and process the rules
        const rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;
        
        for (let j = 0; j < rules.length; j++) {
          const rule = rules[j];
          
          // Handle standard style rules
          if (rule instanceof CSSStyleRule) {
            const style = rule.style;
            // Check all color-related properties
            ['color', 'background-color', 'border-color', 'background'].forEach(prop => {
              const value = style.getPropertyValue(prop);
              if (value && !value.includes('var(') && value !== 'transparent' && value !== 'inherit' && value !== 'initial') {
                extractedColors.add(value);
              }
            });
          }
        }
      } catch (e) {
        // CORS issues with external stylesheets are expected
      }
    }
  } catch (e) {
    console.error("CS: Error extracting colors from stylesheets:", e);
  }
  
  return extractedColors;
}

/**
 * Collect page colors with semantic information
 */
function collectColorsWithSemantics(): {colors: string[], semantics: any} {
  const allColors = new Set<string>();
  const backgroundColors = new Set<string>();
  const textColors = new Set<string>();
  const borderColors = new Set<string>();
  const accentColors = new Set<string>();
  const linkColors = new Set<string>();
  const transparentColors = new Set<string>();
  const trueBackgrounds = new Map<string, string>(); // Map transparent to actual colors
  
  // First get the base background colors
  const htmlBgColor = getComputedStyle(document.documentElement).backgroundColor;
  const bodyBgColor = getComputedStyle(document.body).backgroundColor;
  
  // Add HTML background (even if transparent)
  allColors.add(htmlBgColor);
  backgroundColors.add(htmlBgColor);
  if (htmlBgColor === "transparent" || htmlBgColor === "rgba(0, 0, 0, 0)") {
    transparentColors.add(htmlBgColor);
    // For HTML, the true background is usually white
    trueBackgrounds.set(htmlBgColor, "rgb(255, 255, 255)"); 
  }
  
  // Add body background
  allColors.add(bodyBgColor);
  backgroundColors.add(bodyBgColor);
  if (bodyBgColor === "transparent" || bodyBgColor === "rgba(0, 0, 0, 0)") {
    transparentColors.add(bodyBgColor);
    // Body's true background is the HTML background or white
    const trueBodyBg = (htmlBgColor !== "transparent" && htmlBgColor !== "rgba(0, 0, 0, 0)") ? 
                       htmlBgColor : "rgb(255, 255, 255)";
    trueBackgrounds.set(bodyBgColor, trueBodyBg);
  }
  
  // Sample important elements to find text/background relationships
  const colorRelationships: { text: string; background: string; element: string; transparent: boolean }[] = [];
  const importantElements = [
    document.body,
    ...Array.from(document.querySelectorAll('main, article, header, nav, .content, h1, h2, a, button, input, p')).slice(0, 30)
  ];
  
  importantElements.forEach(element => {
    if (!(element instanceof HTMLElement)) return;
    
    const computedStyle = getComputedStyle(element);
    const textColor = computedStyle.color;
    let bgColor = computedStyle.backgroundColor;
    
    // Add colors to collections
    if (textColor) {
      allColors.add(textColor);
      textColors.add(textColor);
    }
    
    if (bgColor) {
      allColors.add(bgColor);
      backgroundColors.add(bgColor);
      
      // If transparent, find and store the true background
      if (bgColor === "transparent" || bgColor === "rgba(0, 0, 0, 0)") {
        transparentColors.add(bgColor);
        const trueBg = getActualBackgroundColor(element);
        trueBackgrounds.set(bgColor, trueBg);
        
        // Also add the true background to our color collection
        allColors.add(trueBg);
        backgroundColors.add(trueBg);
        
        // Use the true background for the relationship
        bgColor = trueBg;
      }
    }
    
    // Store the text/background relationship
    if (textColor && bgColor) {
      colorRelationships.push({
        text: textColor,
        background: bgColor,
        element: element.tagName.toLowerCase(),
        transparent: bgColor === "transparent" || bgColor === "rgba(0, 0, 0, 0)"
      });
    }
  });
  
  // Extract colors from stylesheets as before...
  
  // Return enhanced semantics with relationships and true backgrounds
  return {
    colors: Array.from(allColors),
    semantics: {
      backgroundColors: Array.from(backgroundColors),
      textColors: Array.from(textColors),
      borderColors: Array.from(borderColors),
      accentColors: Array.from(accentColors),
      linkColors: Array.from(linkColors),
      transparentColors: Array.from(transparentColors),
      trueBackgrounds: Object.fromEntries(trueBackgrounds),
      relationships: colorRelationships.slice(0, 10)
    }
  };
}

/**
 * Get the actual visible background color of an element, accounting for transparency
 * by traversing up the DOM tree to find what's showing through
 */
function getActualBackgroundColor(element: HTMLElement): string {
  const computedStyle = window.getComputedStyle(element);
  const bgColor = computedStyle.backgroundColor;
  
  // If the background is fully transparent, look at parent elements
  if (bgColor === "rgba(0, 0, 0, 0)" || bgColor === "transparent") {
    // Traverse up to find the first non-transparent parent
    let currentElement = element.parentElement;
    while (currentElement) {
      const parentBgColor = window.getComputedStyle(currentElement).backgroundColor;
      if (parentBgColor !== "rgba(0, 0, 0, 0)" && parentBgColor !== "transparent") {
        return parentBgColor; // Found a non-transparent parent
      }
      currentElement = currentElement.parentElement;
    }
    
    // If we reach the top without finding a color, use document/body background
    const htmlBg = window.getComputedStyle(document.documentElement).backgroundColor;
    if (htmlBg !== "rgba(0, 0, 0, 0)" && htmlBg !== "transparent") {
      return htmlBg;
    }
    
    const bodyBg = window.getComputedStyle(document.body).backgroundColor;
    if (bodyBg !== "rgba(0, 0, 0, 0)" && bodyBg !== "transparent") {
      return bodyBg;
    }
    
    // Last resort: assume white
    return "rgb(255, 255, 255)";
  }
  
  // Not transparent, return the actual color
  return bgColor;
}

// Improve the message listener to be more robust
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    console.log(`THEMER: Received message: ${message.type}`, message);
    
    if (message.type === "APPLY_MAP") {
      console.log(`THEMER: Applying color map with ${Object.keys(message.payload).length} colors`);
      applyColorMap(message.payload);
      sendResponse({success: true});
      return true;
    }
    
    if (message.type === "GET_COLORS") {
      const colorInfo = collectColorsWithSemantics();
      console.log("THEMER: Sending colors:", colorInfo.colors.length);
      sendResponse({
        colors: colorInfo.colors,
        semantics: colorInfo.semantics
      });
      return true;
    }
    
    console.warn("THEMER: Unknown message type:", message.type);
    sendResponse({success: false, error: "Unknown message type"});
    return true;
  } catch (error) {
    console.error("THEMER: Error handling message:", error);
    sendResponse({success: false, error: String(error)});
    return true;
  }
});

// Test communication immediately
setTimeout(() => {
  try {
    console.log("THEMER CONTENT SCRIPT: Sending test message to background");
    browser.runtime.sendMessage({
      type: "CONTENT_SCRIPT_LOADED",
      url: window.location.href,
      timestamp: Date.now()
    }).then(response => {
      console.log("THEMER CONTENT SCRIPT: Got response from background:", response);
    }).catch(error => {
      console.error("THEMER CONTENT SCRIPT: Error sending test message:", error);
    });
  } catch (e) {
    console.error("THEMER CONTENT SCRIPT: Error in test communication:", e);
  }
}, 1000);

// Apply theme on page load
async function applyInitialTheme() {
  try {
    console.log("CS (applyInitialTheme): Function called. Requesting initial theme settings from background.");
    const activeSettings = await browser.runtime.sendMessage({ type: "GET_ACTIVE_SETTINGS_FOR_TLD" });
    console.log("CS (applyInitialTheme): Received response:", activeSettings ? 
      `Style: ${activeSettings.style}, palette items: ${Object.keys(activeSettings.palette || {}).length}` : 'null');
    
    if (activeSettings && activeSettings.palette && Object.keys(activeSettings.palette).length > 0) {
      console.log(`CS (applyInitialTheme): Applying initial theme. Style: ${activeSettings.style}`);
      applyColorMap(activeSettings.palette);
    } else {
      console.log("CS (applyInitialTheme): No active theme found. Applying empty map.");
      applyColorMap({}); 
    }
  } catch (error) {
    console.error("CS (applyInitialTheme): Error:", error);
    if ((error as Error).message.includes("Receiving end does not exist")) {
      console.warn("CS (applyInitialTheme): Background script not ready yet.");
    }
  }
}

// Handle page load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    console.log("CS: DOMContentLoaded. Sending colors and applying initial theme.");
    if (document.body) {
      const colorInfo = collectColorsWithSemantics();
      browser.runtime.sendMessage({ 
        type: "COLOR_SET", 
        payload: colorInfo.colors 
      }).catch(e => console.error("CS: Error sending COLOR_SET:", e));
    }
    applyInitialTheme();
  });
} else {
  console.log("CS: Document already loaded. Sending colors and applying initial theme.");
  if (document.body) {
    const colorInfo = collectColorsWithSemantics();
    browser.runtime.sendMessage({ 
      type: "COLOR_SET", 
      payload: colorInfo.colors 
    }).catch(e => console.error("CS: Error sending COLOR_SET:", e));
  }
  applyInitialTheme();
}

// Make dev utilities available
try {
  const isDev = browser.runtime.getManifest().version.includes('dev') || 
                browser.runtime.getManifest().version === '0.1.0';
                
  if (isDev) {
    console.log('[Themer] Running in development mode');
    
    // Expose useful development utilities
    window.themer = window.themer || {};
    window.themer.saveDevKey = consoleUtils.saveDevKey;
    window.themer.checkDevKey = consoleUtils.checkDevKey;
    window.themer.clearDevKey = consoleUtils.clearDevKey;
    
    console.log('[Themer] Development utilities available. Use window.themer.saveDevKey("your-key")');
  }
} catch (e) {
  // Silently ignore errors in production builds
  console.debug('[Themer] Could not initialize development utilities:', e);
}

// Themer Activity Indicator
(function verifyContentScriptRunning() {
  const indicator = document.createElement('div');
  indicator.id = 'themer-content-script-indicator';
  indicator.style.cssText = 'position:fixed;top:0;right:0;background:red;color:white;padding:2px 5px;z-index:999999;font-size:10px;';
  indicator.textContent = 'Themer Active';
  document.documentElement.appendChild(indicator);
  
  // Hide after 5 seconds
  setTimeout(() => {
    if (indicator && indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
    }
  }, 5000);
})();

// Add this after your verifyContentScriptRunning function

function enableDebugMode() {
  // Create debug overlay
  const debugPanel = document.createElement('div');
  debugPanel.style.cssText = 'position:fixed;bottom:0;right:0;background:rgba(0,0,0,0.8);color:white;padding:10px;z-index:999999;font-size:12px;max-height:30vh;overflow:auto;';
  debugPanel.textContent = 'Themer Debug:';
  document.body.appendChild(debugPanel);
  
  // Add debug log function
  window.themerDebug = (msg: string, data?: any) => {
    const logItem = document.createElement('div');
    logItem.textContent = `${new Date().toLocaleTimeString()}: ${msg}`;
    if (data) {
      console.log(`THEMER DEBUG: ${msg}`, data);
    }
    debugPanel.appendChild(logItem);
    
    // Keep only last 20 messages
    while (debugPanel.childNodes.length > 21) {
      debugPanel.removeChild(debugPanel.childNodes[1]);
    }
  };
  
  window.themerDebug('Debug mode enabled');
}

// Enable with "?themer-debug=1" in URL
if (window.location.search.includes('themer-debug=1')) {
  setTimeout(enableDebugMode, 1000);
}

// Add to global window for debugging
declare global {
  interface Window {
    themerDebug?: (msg: string, data?: any) => void;
  }
}