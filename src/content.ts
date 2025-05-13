// content.ts - Runs in the context of web pages
import type { ColorMap } from "./types";

// Import dev console utilities (will be tree-shaken in production)
import * as consoleUtils from './utils/console-utils';

// At the very beginning of your content script, add:
console.log("THEMER CONTENT SCRIPT: Script executing on " + window.location.href);

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

// Extend Window interface to inform TypeScript about custom properties
declare global {
  interface Window {
    saveDevKey?: typeof consoleUtils.saveDevKey;
    checkDevKey?: typeof consoleUtils.checkDevKey;
    clearDevKey?: typeof consoleUtils.clearDevKey;
    themer?: {
      saveDevKey: typeof consoleUtils.saveDevKey;
      checkDevKey: typeof consoleUtils.checkDevKey;
      clearDevKey: typeof consoleUtils.clearDevKey;
    };
    themerDebug?: (msg: string, data?: any) => void;
  }
}

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
      
      // Calculate perceived brightness
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      if (brightness < 128) {
        // Threshold for "dark" colors
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

function applyColorMap(colorMap: ColorMap, semanticsFromBackground?: any): void {
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
  
  // Add CSS variable overrides if the semantics contains varFallbacks
  const varFallbacksToOverride = semanticsFromBackground?.varFallbacks || [];

  if (varFallbacksToOverride.length > 0) {
    let varOverrideCss = ':root {\n';
    const overriddenVars = new Set<string>(); // To avoid duplicate overrides for the same variable

    varFallbacksToOverride.forEach((item: {varName: string, fallbackColor: string}) => {
      const mappedFallbackColor = colorMap[item.fallbackColor];
      if (mappedFallbackColor && !overriddenVars.has(item.varName)) {
        // Apply if the fallback was mapped
        varOverrideCss += `  ${item.varName}: ${mappedFallbackColor} !important; /* Original fallback: ${item.fallbackColor} */\n`;
        overriddenVars.add(item.varName);
      }
    });
    varOverrideCss += '}';
    if (overriddenVars.size > 0) {
      cssRules.push(varOverrideCss);
      console.log("CS: Added CSS variable overrides for fallbacks:", overriddenVars.size);
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

interface ExtractedSheetData {
  colorsToMap: Set<string>;
  varFallbacks: Array<{varName: string, fallbackColor: string}>;
}

// Helper to identify if a string is a plausible color string (simplified)
// Helper to identify if a string is a plausible color string (simplified)
function isColorString(str: string | null | undefined): boolean {
  if (!str) return false;
  // Make sure str is actually a string before calling toLowerCase()
  if (typeof str !== 'string') {
    console.warn("THEMER: Non-string value passed to isColorString:", str);
    return false;
  }
  const s = str.toLowerCase().trim();
  if (s === 'transparent' || s === 'inherit' || s === 'initial' || s === 'currentcolor' || s.includes('var(')) return false;
  return s.startsWith('#') || s.startsWith('rgb') || s.startsWith('hsl') || /^[a-z]+(-[a-z]+)*$/.test(s); // basic check for named colors too
}

// Extract colors from stylesheets with CSS variable fallbacks
function extractColorsFromStylesheets(): ExtractedSheetData {
  const colorsToMap = new Set<string>();
  const varFallbacks: Array<{varName: string, fallbackColor: string}> = [];
  // Regex to find var(name, fallback) or var(name)
  // It captures the variable name and optionally the fallback.
  const cssVarPattern = /var\(\s*(--[^,\s)]+)\s*(?:,\s*([^)]+))?\)/g;

  // Convert StyleSheetList to an array to make it iterable
  const styleSheetsArray = Array.from(document.styleSheets);

  for (const sheet of styleSheetsArray) {
    try {
      // Prevent CORS errors for cross-origin stylesheets
      if (sheet.href && !sheet.href.startsWith(window.location.origin) && !sheet.href.startsWith('blob:') && !sheet.href.startsWith('data:')) {
        // Check if rules can be accessed, if not, skip
        try {
            // @ts-ignore
            if (!sheet.cssRules && !sheet.rules) continue;
        } catch (e) {
            // console.warn(`CS: Cannot access rules in stylesheet: ${sheet.href}`, e);
            continue;
        }
      }
        
      const rules = sheet.cssRules || sheet.rules;
      if (!rules) continue;

      // Convert CSSRuleList to an array before iterating
      const rulesArray = Array.from(rules);

      for (const rule of rulesArray) {
        if (rule instanceof CSSStyleRule) {
          const style = rule.style;
          for (let k = 0; k < style.length; k++) {
            const propName = style[k];
            // Consider only color-related properties for efficiency
            if (!propName.includes('color') && !propName.includes('background') && !propName.includes('border') && !propName.includes('shadow') && !propName.includes('fill') && !propName.includes('stroke')) {
              continue;
            }
            const propValue = style.getPropertyValue(propName);

            if (propValue) {
              let match;
              cssVarPattern.lastIndex = 0; // Reset regex state
              let hasVar = false;
              while ((match = cssVarPattern.exec(propValue)) !== null) {
                hasVar = true;
                const varName = match[1].trim();
                const fallbackColor = match[2] ? match[2].trim() : null;

                if (fallbackColor && isColorString(fallbackColor)) {
                  colorsToMap.add(fallbackColor);
                  // Avoid duplicates for the same var-fallback pair
                  if (!varFallbacks.some(vf => vf.varName === varName && vf.fallbackColor === fallbackColor)) {
                    varFallbacks.push({ varName, fallbackColor });
                  }
                }
              }

              // If the property value is not a variable itself, or contains non-variable parts that are colors
              if (!hasVar || (propValue.replace(cssVarPattern, '').trim() !== '')) {
                // Attempt to parse direct colors if the value isn't solely a var() or complex expression
                const potentialDirectColor = propValue.trim();
                if (!potentialDirectColor.startsWith('var(') && isColorString(potentialDirectColor)) {
                  colorsToMap.add(potentialDirectColor);
                }
              }
            }
          }
        }
      }
    } catch (e) {
      // console.warn("CS: Error processing stylesheet:", sheet.href, e);
    }
  }
  return { colorsToMap, varFallbacks };
}

/**
 * Collect page colors with semantic information
 */
function collectColorsWithSemantics(): {colors: string[], semantics: any} {
  console.log("CS (collectColorsWithSemantics): Starting color and semantic collection.");
  const allColors = new Set<string>();
  const backgroundColors = new Set<string>();
  const textColors = new Set<string>();
  const borderColors = new Set<string>(); // To be populated if specific border collection is added
  const accentColors = new Set<string>(); // To be populated based on heuristics or specific elements
  const linkColors = new Set<string>();   // To be populated from <a> tags
  const transparentColors = new Set<string>();
  const trueBackgrounds = new Map<string, string>(); // Map transparent original color string to actual visible background string
  const colorRelationships: { text: string; background: string; element: string; transparent: boolean }[] = [];

  // 1. Get base HTML and body background colors
  if (document.documentElement) {
    const htmlStyle = getComputedStyle(document.documentElement);
    const htmlBgColor = htmlStyle.backgroundColor;
    if (isColorString(htmlBgColor)) {
      allColors.add(htmlBgColor);
      backgroundColors.add(htmlBgColor);
      if (htmlBgColor === "transparent" || htmlBgColor === "rgba(0, 0, 0, 0)") {
        transparentColors.add(htmlBgColor);
        // For HTML, the true background is often effectively white or the browser default
        trueBackgrounds.set(htmlBgColor, "rgb(255, 255, 255)");
      }
    }
  }

  if (document.body) {
    const bodyStyle = getComputedStyle(document.body);
    const bodyBgColor = bodyStyle.backgroundColor;
    if (isColorString(bodyBgColor)) {
      allColors.add(bodyBgColor);
      backgroundColors.add(bodyBgColor);
      if (bodyBgColor === "transparent" || bodyBgColor === "rgba(0, 0, 0, 0)") {
        transparentColors.add(bodyBgColor);
        const actualHtmlBg = document.documentElement ? getComputedStyle(document.documentElement).backgroundColor : "rgb(255, 255, 255)";
        const trueBodyBg = (isColorString(actualHtmlBg) && actualHtmlBg !== "transparent" && actualHtmlBg !== "rgba(0, 0, 0, 0)")
                           ? actualHtmlBg
                           : "rgb(255, 255, 255)";
        trueBackgrounds.set(bodyBgColor, trueBodyBg);
      }
    }
  }

  // 2. Sample important elements for text/background relationships and common colors
  // Prioritize elements likely to define key color relationships
  const selectorsForRelationships = [
    'body', 'main', 'article', 'section', 'header', 'footer', 'nav', 'aside',
    'h1', 'h2', 'h3', 'p', 'a', 'button', 'input[type="text"]', 'input[type="submit"]',
    '.card', '.container', '.content', // Common layout classes
    '[role="banner"]', '[role="main"]', '[role="navigation"]', '[role="contentinfo"]'
  ];

  const importantElements: HTMLElement[] = [];
  selectorsForRelationships.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(el => {
        if (el instanceof HTMLElement && el.offsetParent !== null) { // Check if visible
            importantElements.push(el);
        }
      });
    } catch (e) {
        // console.warn(`CS: Error selecting elements with "${selector}":`, e);
    }
  });
  // Deduplicate and limit
  const uniqueImportantElements = Array.from(new Set(importantElements)).slice(0, 50);

  uniqueImportantElements.forEach(element => {
    const computedStyle = getComputedStyle(element);
    const textColor = computedStyle.color;
    let originalBgColor = computedStyle.backgroundColor; // This is the element's own BG
    let effectiveBgColor = originalBgColor; // This will be the true visible BG

    let isTransparentBg = false;

    if (isColorString(textColor)) {
      allColors.add(textColor);
      textColors.add(textColor);
      if (element.tagName === 'A' && element.closest('nav, header, footer')) {
        linkColors.add(textColor); // Simple heuristic for link colors
      }
    }

    if (isColorString(originalBgColor)) {
      allColors.add(originalBgColor);
      backgroundColors.add(originalBgColor);

      if (originalBgColor === "transparent" || originalBgColor === "rgba(0, 0, 0, 0)") {
        isTransparentBg = true;
        transparentColors.add(originalBgColor);
        const trueBg = getActualBackgroundColor(element); // Recursive function to find visible BG
        trueBackgrounds.set(originalBgColor, trueBg); // Map the "transparent" string to its actual underlying color
        
        // Also add the true background to our color collection if it's a valid color
        if (isColorString(trueBg)) {
            allColors.add(trueBg);
            backgroundColors.add(trueBg);
        }
        effectiveBgColor = trueBg; // Use the true background for the relationship
      }
    }
    
    // Add border colors from these important elements
    const borderColor = computedStyle.borderColor; // This gets the shorthand
    // For more specific borders, you'd check borderTopColor, borderRightColor, etc.
    if (isColorString(borderColor) && borderColor !== textColor && borderColor !== effectiveBgColor) {
        allColors.add(borderColor);
        borderColors.add(borderColor);
    }

    // Store the text/background relationship using the effective background color
    if (isColorString(textColor) && isColorString(effectiveBgColor)) {
      // Avoid adding too many identical relationships from deeply nested similar elements
      const relationshipExists = colorRelationships.some(
        r => r.text === textColor && r.background === effectiveBgColor && r.element === element.tagName.toLowerCase()
      );
      if (!relationshipExists || colorRelationships.length < 5) { // Allow a few duplicates if list is short
         colorRelationships.push({
            text: textColor,
            background: effectiveBgColor, // Use the resolved background
            element: element.tagName.toLowerCase() + (element.id ? `#${element.id}` : '') + (element.className && typeof element.className === 'string' ? `.${element.className.split(' ').join('.')}` : ''),
            transparent: isTransparentBg // Was the element's OWN background transparent?
          });
      }
    }
  });

  // 3. Extract colors from stylesheets (including CSS variable fallbacks)
  const sheetData = extractColorsFromStylesheets();
  sheetData.colorsToMap.forEach(color => {
    if (isColorString(color)) {
      allColors.add(color);
      // Heuristic: if a color from a stylesheet isn't already a known text/bg, it might be an accent/border
      if (!textColors.has(color) && !backgroundColors.has(color) && !borderColors.has(color)) {
        accentColors.add(color);
      }
    }
  });

  // 4. Consolidate and build the semantics object
  const finalSemantics = {
    backgroundColors: Array.from(new Set([...backgroundColors, ...sheetData.colorsToMap.values()].filter(c => !textColors.has(c) || backgroundColors.has(c)))), // Prioritize as BG if ambiguous
    textColors: Array.from(textColors),
    borderColors: Array.from(borderColors),
    accentColors: Array.from(accentColors), // Colors that weren't clearly text or main backgrounds
    linkColors: Array.from(linkColors),
    transparentColors: Array.from(transparentColors), // Original transparent strings
    trueBackgrounds: Object.fromEntries(trueBackgrounds), // Map of transparent string to its resolved solid color string
    relationships: colorRelationships.slice(0, 15), // Limit to a reasonable number for the prompt
    varFallbacks: sheetData.varFallbacks || [] // From extractColorsFromStylesheets
  };
  
  // Ensure all colors in semantic categories are also in allColors
  Object.values(finalSemantics).forEach(category => {
    if (Array.isArray(category)) {
      category.forEach(color => {
        if (isColorString(color as string)) allColors.add(color as string);
      });
    } else if (typeof category === 'object' && category !== null && !Array.isArray(category)) {
        // For trueBackgrounds
        Object.values(category).forEach(color => {
             if (isColorString(color as string)) allColors.add(color as string);
        });
    }
  });

  const finalColorsArray = Array.from(allColors).filter(c => isColorString(c));
  console.log(`CS (collectColorsWithSemantics): Collected ${finalColorsArray.length} unique valid colors. Relationships: ${finalSemantics.relationships.length}. VarFallbacks: ${finalSemantics.varFallbacks.length}.`);
  if (finalColorsArray.length < 20) {
    // console.log("CS: Final collected colors:", finalColorsArray);
    // console.log("CS: Final semantics:", finalSemantics);
  }

  return {
    colors: finalColorsArray,
    semantics: finalSemantics
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

// Replace your existing message listener with this enhanced version:
let lastMessageProcessedTime = 0;
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    // Track when we process messages to prevent duplicates
    const now = Date.now();
    if (now - lastMessageProcessedTime < 50 && message.type === "GET_COLORS") {
      console.log(`THEMER: Duplicate ${message.type} message detected and ignored (${now - lastMessageProcessedTime}ms)`);
      sendResponse({success: false, error: "Duplicate message"});
      return true;
    }
    lastMessageProcessedTime = now;
    
    console.log(`THEMER: Received message: ${message.type}`, message);
    
    if (message.type === "APPLY_MAP") {
      console.log(`THEMER: Applying color map with ${Object.keys(message.payload).length} colors`);
      applyColorMap(message.payload, message.semantics);
      sendResponse({success: true});
      return true;
    }
    
    if (message.type === "GET_COLORS") {
      console.log("THEMER: Processing GET_COLORS request...");
      
      // Force indicator to show we're processing the request
      if (window.location.hostname.includes('amazon')) {
        const indicator = document.createElement('div');
        indicator.id = 'themer-processing-indicator';
        indicator.style.cssText = 'position:fixed;top:0;left:0;background:blue;color:white;padding:2px 5px;z-index:999999;font-size:10px;';
        indicator.textContent = 'Themer Processing';
        document.body ? document.body.appendChild(indicator) : document.documentElement.appendChild(indicator);
      }
      
      try {
        const colorInfo = collectColorsWithSemantics();
        console.log("THEMER: Sending colors:", colorInfo.colors.length);
        
        // Remove the processing indicator if it exists
        const indicator = document.getElementById('themer-processing-indicator');
        if (indicator && indicator.parentNode) {
          indicator.parentNode.removeChild(indicator);
        }
        
        sendResponse({
          colors: colorInfo.colors,
          semantics: colorInfo.semantics
        });
      } catch (colorError) {
        console.error("THEMER: Error collecting colors:", colorError);
        sendResponse({success: false, error: `Error collecting colors: ${String(colorError)}`});
      }
      return true;
    }
    
    // Added explicit detection for content script verification
    if (message.type === "VERIFY_CONTENT_SCRIPT") {
      console.log("THEMER: Content script verification requested");
      verifyContentScriptRunning();
      sendResponse({success: true, timestamp: Date.now()});
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
      applyColorMap(activeSettings.palette, activeSettings.semantics);
    } else {
      console.log("CS (applyInitialTheme): No active theme found. Applying empty map.");
      applyColorMap({}, null); 
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
        payload: colorInfo.colors,
        semantics: colorInfo.semantics
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
      payload: colorInfo.colors, 
      semantics: colorInfo.semantics
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
    window.themer = {
      saveDevKey: consoleUtils.saveDevKey,
      checkDevKey: consoleUtils.checkDevKey,
      clearDevKey: consoleUtils.clearDevKey
    };
    
    console.log('[Themer] Development utilities available. Use window.themer.saveDevKey("your-key")');
  }
} catch (e) {
  // Silently ignore errors in production builds
  console.debug('[Themer] Could not initialize development utilities:', e);
}

// Verify the content script is running (for debugging)
function verifyContentScriptRunning() {
  console.log("THEMER CONTENT SCRIPT: verifyContentScriptRunning called");
  const indicator = document.createElement('div');
  indicator.id = 'themer-content-script-indicator';
  indicator.style.cssText = 'position:fixed;top:0;right:0;background:red;color:white;padding:2px 5px;z-index:999999;font-size:10px;';
  indicator.textContent = 'Themer Active';
  document.body ? document.body.appendChild(indicator) : document.documentElement.appendChild(indicator);
  
  // Hide after 5 seconds
  setTimeout(() => {
    if (indicator && indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
    }
  }, 5000);
}

// Always run this on Amazon to confirm script loading
if (window.location.hostname.includes('amazon')) {
  setTimeout(verifyContentScriptRunning, 500);
}

// Enable debug mode for troubleshooting
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
    while (debugPanel.childNodes.length > 21) { // Ensure there's always the "Themer Debug:" title
      if (debugPanel.childNodes[1]) { // Check if the child exists before removing
         debugPanel.removeChild(debugPanel.childNodes[1]);
      } else {
        break; // Should not happen if length > 21
      }
    }
  };
  
  if (window.themerDebug) { // Check if it was successfully assigned
    window.themerDebug('Debug mode enabled');
  }
}

// Enable with "?themer-debug=1" in URL
if (window.location.search.includes('themer-debug=1')) {
  setTimeout(enableDebugMode, 1000);
}

// Initial verification
(function() {
  console.log("CS: Content script initialization complete");
  if (window.location.search.includes('themer-verify=1')) {
    verifyContentScriptRunning();
  }
})();