// content.ts
type ColorMap = Record<string, string>;

console.log("Content script loaded at", new Date().toISOString());

try {
  function collectColors(): string[] {
    const colors = new Set<string>();
    const treeWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node: Element | null;
    while ((node = treeWalker.nextNode() as Element | null)) {
      const cs = getComputedStyle(node);
      ["color", "backgroundColor", "borderColor"].forEach(prop => {
        const val = cs[prop as keyof CSSStyleDeclaration] as string;
        // Filter transparent / empty
        if (val && !val.startsWith("rgba(0, 0, 0, 0)")) colors.add(val);
      });
    }
    return [...colors];
  }

  function applyColorMap(colorMap: ColorMap): void {
    // Remove any existing style
    const existingStyle = document.getElementById("color-rewriter-style");
    if (existingStyle) existingStyle.remove();
    
    // Method 1: Create CSS Variables for the whole page
    const rootStyle = document.createElement("style");
    rootStyle.id = "color-rewriter-root-style";
    rootStyle.textContent = `:root {
      ${Object.entries(colorMap).map(([orig, replacement]) => 
        `--cr-${orig.replace(/[^a-z0-9]/gi, '-')}: ${replacement};`
      ).join('\n')}
    }`;
    document.head.appendChild(rootStyle);
    
    // Method 2: Direct DOM element manipulation
    function updateElementColors(element: Element) {
      if (element instanceof HTMLElement) {
        const style = window.getComputedStyle(element);
        
        for (const [origColor, newColor] of Object.entries(colorMap)) {
          if (style.color === origColor) {
            element.style.setProperty('color', newColor, 'important');
          }
          if (style.backgroundColor === origColor) {
            element.style.setProperty('background-color', newColor, 'important');
          }
          if (style.borderColor === origColor) {
            element.style.setProperty('border-color', newColor, 'important');
          }
        }
      }
    }
    
    // Apply to existing elements
    const elements = document.querySelectorAll('*');
    elements.forEach(updateElementColors);
    
    // Setup observer for new elements
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) {
              updateElementColors(node);
              const childElements = node.querySelectorAll('*');
              childElements.forEach(updateElementColors);
            }
          });
        }
      }
    });
    
    observer.observe(document.body, { 
      childList: true,
      subtree: true
    });
    
    console.log(`Applied ${Object.keys(colorMap).length} color replacements to the page`);
  }

  // Handle messages from background script
  browser.runtime.onMessage.addListener((message) => {
    console.log("Content script received message:", message);
    
    if (message.type === "GET_COLORS") {
      const colors = collectColors();
      console.log(`Collected ${colors.length} colors from page`);
      return Promise.resolve({colors});
    }
    
    if (message.type === "APPLY_MAP") {
      console.log("Applying color map to page:", message.payload);
      applyColorMap(message.payload);
      return Promise.resolve({success: true});
    }
    
    return true;
  });

  // Initial message to background script
  browser.runtime.sendMessage({ 
    type: "COLOR_SET", 
    payload: collectColors() 
  }).catch(error => {
    console.error("Failed to send message to background script:", error);
  });
} catch (error) {
  console.error("Content script error:", error);
}
