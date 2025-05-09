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
    
    // Create a style element
    const style = document.createElement("style");
    style.id = "color-rewriter-style";
    
    // Generate CSS for each color pair
    const cssRules: string[] = [];
    
    // Add rules for inline styles
    Object.entries(colorMap).forEach(([original, replacement]) => {
      // Target all common CSS properties that use colors
      cssRules.push(`
        [style*="color: ${original}"] { color: ${replacement} !important; }
        [style*="background-color: ${original}"] { background-color: ${replacement} !important; }
        [style*="border-color: ${original}"] { border-color: ${replacement} !important; }
        [style*="box-shadow: ${original}"] { box-shadow: 0 0 5px ${replacement} !important; }
      `);
    });
    
    // Add a general CSS observer to catch dynamically applied styles
    const cssObserverCode = `
      (function() {
        const colorMap = ${JSON.stringify(colorMap)};
        
        // Create a MutationObserver to watch for style changes
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.type === "attributes" && mutation.attributeName === "style") {
              const element = mutation.target as HTMLElement;
              const style = element.style;
              
              // Check and replace colors in computed styles
              for (const [original, replacement] of Object.entries(colorMap)) {
                if (style.color === original) style.color = replacement;
                if (style.backgroundColor === original) style.backgroundColor = replacement;
                if (style.borderColor === original) style.borderColor = replacement;
              }
            }
          });
        });
        
        // Start observing
        observer.observe(document.body, {
          attributes: true,
          attributeFilter: ["style"],
          subtree: true
        });
      })();
    `;
    
    // Add the CSS rules to the style element
    style.textContent = cssRules.join("\n");
    document.head.appendChild(style);
    
    // Add the observer script
    const script = document.createElement("script");
    script.textContent = cssObserverCode;
    document.head.appendChild(script);
    
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
