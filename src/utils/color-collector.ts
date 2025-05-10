/**
 * Color collector utility
 * Analyzes page colors and categorizes them by their usage
 */

interface ColorSemantics {
  backgroundColors: string[];
  textColors: string[];
  borderColors: string[];
  accentColors: string[];
  linkColors: string[];
}

interface ColorCollection {
  allColors: string[];
  semantics: ColorSemantics;
}

/**
 * Determines if a color is valid and should be processed
 */
function isValidColor(color: string): boolean {
  return Boolean(color) && 
    color !== "transparent" && 
    color !== "rgba(0, 0, 0, 0)" && 
    color !== "none" && 
    !color.startsWith("var(");
}

/**
 * Collect and categorize colors from the page
 */
export function collectPageColors(): ColorCollection {
  // Sets to store unique colors by category
  const allColors = new Set<string>();
  const backgroundColors = new Set<string>();
  const textColors = new Set<string>();
  const borderColors = new Set<string>();
  const accentColors = new Set<string>();
  const linkColors = new Set<string>();

  // Process HTML and BODY first - critical for dark/light theme backgrounds
  if (document.documentElement) {
    const style = window.getComputedStyle(document.documentElement);
    const bgColor = style.backgroundColor;
    if (isValidColor(bgColor)) {
      allColors.add(bgColor);
      backgroundColors.add(bgColor);
      console.log("ColorCollector: HTML background =", bgColor);
    }
  }

  if (document.body) {
    const style = window.getComputedStyle(document.body);
    const bgColor = style.backgroundColor;
    if (isValidColor(bgColor)) {
      allColors.add(bgColor);
      backgroundColors.add(bgColor);
      console.log("ColorCollector: BODY background =", bgColor);
    }
  }

  // Only process a subset of elements to avoid performance issues
  const maxElements = 1000;
  let processedCount = 0;

  // Use a more efficient approach to collect elements
  // Focus on important elements first, then sample a subset of all elements
  const importantSelectors = [
    'header', 'footer', 'nav', 'aside', 'main', 'article', 'section',
    'h1', 'h2', 'h3', 'button', 'a', '.btn', '.button', '.card', '.panel'
  ];

  // 1. Process important elements first
  const importantElements = document.querySelectorAll(importantSelectors.join(','));
  processElements(importantElements);

  // 2. Sample a subset of all other elements
  const allElements = document.querySelectorAll('*');
  const step = Math.max(1, Math.floor(allElements.length / maxElements));
  for (let i = 0; i < allElements.length; i += step) {
    if (processedCount >= maxElements) break;
    processElement(allElements[i]);
  }

  // 3. Find large divs that are likely content areas
  const largeDivs = Array.from(document.querySelectorAll('div')).filter(div => {
    const rect = div.getBoundingClientRect();
    return rect.width > window.innerWidth * 0.7 && rect.height > window.innerHeight * 0.3;
  });
  processElements(largeDivs);
  // Helper function to process multiple elements
  function processElements(elements: NodeListOf<Element> | Element[]) {
    Array.from(elements).forEach(el => {
      if (processedCount < maxElements) {
        processElement(el);
      }
    });
  }

  // Helper function to process a single element
  function processElement(element: Element) {
    if (!element || processedCount >= maxElements) return;
    
    // Skip script and style elements
    if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE' || element.tagName === 'NOSCRIPT') {
      return;
    }
    
    processedCount++;
    const style = window.getComputedStyle(element);
    const tagName = element.tagName.toLowerCase();
    const className = element.className?.toString() || '';
    const rect = element.getBoundingClientRect();
    const isLargeElement = rect.width > 200 && rect.height > 100;
    
    // Extract color properties
    const color = style.color;
    const bgColor = style.backgroundColor;
    const borderTopColor = style.borderTopColor;
    const borderRightColor = style.borderRightColor;
    const borderBottomColor = style.borderBottomColor;
    const borderLeftColor = style.borderLeftColor;
    
    // Process text color
    if (isValidColor(color)) {
      allColors.add(color);
      textColors.add(color);
      
      // Identify link colors
      if (tagName === 'a') {
        linkColors.add(color);
      }
    }
    
    // Process background color
    if (isValidColor(bgColor)) {
      allColors.add(bgColor);
      
      // Background of large elements is likely important
      if (isLargeElement) {
        backgroundColors.add(bgColor);
      }
      
      // Background of interactive elements is likely an accent color
      if (isInteractiveElement(element)) {
        accentColors.add(bgColor);
      }
    }
    
    // Process border colors
    [borderTopColor, borderRightColor, borderBottomColor, borderLeftColor].forEach(borderColor => {
      if (isValidColor(borderColor)) {
        allColors.add(borderColor);
        borderColors.add(borderColor);
      }
    });
  }
  
  // Helper to check if element is interactive
  function isInteractiveElement(el: Element): boolean {
    const tag = el.tagName.toLowerCase();
    const className = el.className?.toString() || '';
    
    return tag === 'button' || 
           tag === 'a' || 
           tag === 'input' || 
           tag === 'select' || 
           tag === 'textarea' ||
           className.includes('btn') || 
           className.includes('button') ||
           el.id?.includes('button') || 
           el.getAttribute('role') === 'button';
  }

  const result = {
    allColors: Array.from(allColors),
    semantics: {
      backgroundColors: Array.from(backgroundColors),
      textColors: Array.from(textColors),
      borderColors: Array.from(borderColors),
      accentColors: Array.from(accentColors),
      linkColors: Array.from(linkColors)
    }
  };
  
  console.log(`ColorCollector: Found ${allColors.size} colors total, including ${backgroundColors.size} background colors`);
  return result;
}