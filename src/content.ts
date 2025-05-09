// content.ts
type ColorMap = Record<string, string>;

function collectColors(): string[] {
  const set = new Set<string>();
  const treeWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let node: Element | null;
  while ((node = treeWalker.nextNode() as Element | null)) {
    const cs = getComputedStyle(node);
    ["color", "backgroundColor", "borderColor"].forEach(prop => {
      const val = cs[prop as keyof CSSStyleDeclaration] as string;
      // Filter transparent / empty
      if (val && !val.startsWith("rgba(0, 0, 0, 0)")) set.add(val);
    });
  }
  return [...set];
}

browser.runtime.sendMessage({ type: "COLOR_SET", payload: collectColors() });
