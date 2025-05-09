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

  // Send message with error handling
  browser.runtime.sendMessage({ 
    type: "COLOR_SET", 
    payload: collectColors() 
  }).catch(error => {
    console.error("Failed to send message to background script:", error);
  });
} catch (error) {
  console.error("Content script error:", error);
}
