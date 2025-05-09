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
      // Code to apply color map would go here
      // This would interact with painter.ts or include that functionality
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
