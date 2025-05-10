// content.ts - Runs in the context of web pages
import type { ColorMap } from "./types";

// Import dev console utilities (will be tree-shaken in production)
import * as consoleUtils from './utils/console-utils';

console.log("CS: Content script loaded at", new Date().toISOString());

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
  
  isCurrentlyThemed = true;
  console.log("CS: Applying new color map.");
  
  // Check if this is a dark theme
  const isDarkMode = isDarkTheme(colorMap);
  if (isDarkMode) {
    console.log("CS: Detected dark mode theme - ensuring body/html background is dark");
    ensureDarkBackgrounds(colorMap);
  }

  function processElement(element: Element) {
    if (!(element instanceof HTMLElement) || element.tagName === 'SCRIPT' || element.tagName === 'STYLE' || element.tagName === 'NOSCRIPT') {
      return;
    }
    
    const htmlElement = element as HTMLElement;
    const computedStyle = getComputedStyle(htmlElement);

    // Special handling for html and body in dark mode
    const isHtmlOrBody = element === document.documentElement || element === document.body;
    
    // Force dark background on html/body if needed
    if (isDarkMode && isHtmlOrBody) {
      const currentBgColor = computedStyle.backgroundColor;
      const newColor = colorMap[currentBgColor];
      
      if (!newColor && currentBgColor !== "rgba(0, 0, 0, 0)" && currentBgColor !== "transparent") {
        // Add to colorMap if not already there
        colorMap[currentBgColor] = "#121212";
        console.log(`CS: Force-added dark mapping for ${element.tagName} background:`, currentBgColor, "→ #121212");
      }
    }

    // Normal property processing
    const propertiesToProcess = [
      { computed: computedStyle.color, inlineProp: 'color' as keyof TrackedStyleProperties },
      { computed: computedStyle.backgroundColor, inlineProp: 'backgroundColor' as keyof TrackedStyleProperties },
      { computed: computedStyle.borderColor, inlineProp: 'borderColor' as keyof TrackedStyleProperties },
      { computed: computedStyle.borderTopColor, inlineProp: 'borderTopColor' as keyof TrackedStyleProperties },
      { computed: computedStyle.borderRightColor, inlineProp: 'borderRightColor' as keyof TrackedStyleProperties },
      { computed: computedStyle.borderBottomColor, inlineProp: 'borderBottomColor' as keyof TrackedStyleProperties },
      { computed: computedStyle.borderLeftColor, inlineProp: 'borderLeftColor' as keyof TrackedStyleProperties },
    ];

    const originalStylesForThisElement = originalInlineStyles.get(htmlElement) || {};
    let modifiedOriginals = false;

    propertiesToProcess.forEach(item => {
      const newColor = colorMap[item.computed];
      
      // Extra debugging for background colors of html/body
      if (item.inlineProp === 'backgroundColor' && (htmlElement === document.body || htmlElement === document.documentElement)) {
        console.log(`CS_DEBUG: BGColor Check for ${htmlElement.tagName}:`, {
          originalColor: item.computed,
          hasMapping: newColor ? true : false,
          newColor: newColor || 'none'
        });
      }

      if (newColor && item.computed !== newColor) { 
        if (originalStylesForThisElement[item.inlineProp] === undefined) {
          originalStylesForThisElement[item.inlineProp] = htmlElement.style[item.inlineProp as any] || ""; 
          modifiedOriginals = true;
        }
        htmlElement.style.setProperty(item.inlineProp as string, newColor, 'important');
      }
    });

    if (modifiedOriginals) {
      originalInlineStyles.set(htmlElement, originalStylesForThisElement);
    }
  }

  // Process html and body elements first for better debugging visibility
  if (document.documentElement) processElement(document.documentElement);
  if (document.body) {
    processElement(document.body);
    document.querySelectorAll('body *').forEach(el => processElement(el));
  }

  // Set up mutation observer to process new elements
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
  
  // First collect colors from HTML and BODY elements (important for backgrounds)
  if (document.documentElement) {
    const htmlStyle = getComputedStyle(document.documentElement);
    const bgColor = htmlStyle.backgroundColor;
    if (bgColor && bgColor !== "transparent" && bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "none") {
      allColors.add(bgColor);
      backgroundColors.add(bgColor);
      console.log("CS: HTML background color:", bgColor);
    }
  }
  
  if (document.body) {
    const bodyStyle = getComputedStyle(document.body);
    const bgColor = bodyStyle.backgroundColor;
    if (bgColor && bgColor !== "transparent" && bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "none") {
      allColors.add(bgColor);
      backgroundColors.add(bgColor);
      console.log("CS: BODY background color:", bgColor);
    }
  }
  
  // Sample elements from the page to avoid performance issues
  const maxElements = 1000;
  let count = 0;
  
  const treeWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let node: Element | null;
  
  while ((node = treeWalker.nextNode() as Element | null) && count < maxElements) {
    if (!node || node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.tagName === 'NOSCRIPT') continue;
    count++;
    
    const cs = getComputedStyle(node);
    const tagName = node.tagName.toLowerCase();
    
    // Extract color properties
    const color = cs.color;
    const bgColor = cs.backgroundColor;
    const borderTop = cs.borderTopColor;
    const borderRight = cs.borderRightColor;
    const borderBottom = cs.borderBottomColor;
    const borderLeft = cs.borderLeftColor;
    
    // Handle text color
    if (color && color !== "transparent" && color !== "rgba(0, 0, 0, 0)" && color !== "none") {
      allColors.add(color);
      textColors.add(color);
      
      // Special handling for link colors
      if (tagName === 'a') {
        linkColors.add(color);
      }
    }
    
    // Handle background color
    if (bgColor && bgColor !== "transparent" && bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "none") {
      allColors.add(bgColor);
      
      // Check if likely to be a main content area
      const rect = node.getBoundingClientRect();
      if (rect.width > 200 && rect.height > 100) {
        backgroundColors.add(bgColor);
      }
      
      // Check if interactive element
      if (tagName === 'button' || tagName === 'input' || tagName === 'a') {
        accentColors.add(bgColor);
      }
    }
    
    // Handle border colors
    [borderTop, borderRight, borderBottom, borderLeft].forEach(borderColor => {
      if (borderColor && borderColor !== "transparent" && borderColor !== "rgba(0, 0, 0, 0)" && borderColor !== "none") {
        allColors.add(borderColor);
        borderColors.add(borderColor);
      }
    });
  }
  
  // Collect colors from main content areas
  document.querySelectorAll('main, article, .content, .main, #content, #main').forEach(el => {
    const style = getComputedStyle(el);
    const bgColor = style.backgroundColor;
    if (bgColor && bgColor !== "transparent" && bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "none") {
      allColors.add(bgColor);
      backgroundColors.add(bgColor);
    }
  });
  
  // Return results
  return {
    colors: Array.from(allColors),
    semantics: {
      backgroundColors: Array.from(backgroundColors),
      textColors: Array.from(textColors),
      borderColors: Array.from(borderColors),
      accentColors: Array.from(accentColors),
      linkColors: Array.from(linkColors)
    }
  };
}

// Set up message listener for handling commands from background script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(`CS: Received message: ${message.type}`);
  
  if (message.type === "APPLY_MAP") {
    console.log(`CS (APPLY_MAP handler): Received APPLY_MAP. Payload items: ${message.payload ? Object.keys(message.payload).length : '(no payload)'}. Applying...`);
    applyColorMap(message.payload);
    sendResponse({success: true});
    return true; 
  }
  
  if (message.type === "GET_COLORS") {
    const colorInfo = collectColorsWithSemantics();
    console.log("CS (GET_COLORS handler): Sending colors:", colorInfo.colors.length);
    sendResponse({
      colors: colorInfo.colors,
      semantics: colorInfo.semantics
    });
    return true; 
  }
  
  console.warn("CS: Unknown message type received by content script:", message.type);
  return false;
});

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