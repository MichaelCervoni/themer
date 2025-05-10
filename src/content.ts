// content.ts - Runs in the context of web pages
import type { ColorMap } from "./types";

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

function collectColors(): string[] {
  const colors = new Set<string>();
  if (!document.body) return [];

  const treeWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let node: Element | null;
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
  
  console.log(`CS (collectColors): Collected ${colors.size} unique colors.`);
  return [...colors];
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
    const colors = collectColors();
    console.log("CS (GET_COLORS handler): Sending colors:", colors.length);
    sendResponse({colors: colors});
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
      browser.runtime.sendMessage({ type: "COLOR_SET", payload: collectColors() })
        .catch(e => console.error("CS: Error sending COLOR_SET:", e));
    }
    applyInitialTheme();
  });
} else {
  console.log("CS: Document already loaded. Sending colors and applying initial theme.");
  if (document.body) {
    browser.runtime.sendMessage({ type: "COLOR_SET", payload: collectColors() })
      .catch(e => console.error("CS: Error sending COLOR_SET:", e));
  }
  applyInitialTheme();
}
