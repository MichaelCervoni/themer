// painter.ts – runs in the page
browser.runtime.onMessage.addListener((msg) => {
    if (msg.type !== "APPLY_MAP") return;
    const map: Record<string, string> = msg.payload;
    const css = Object.entries(map)
      .map(([from, to]) => `
        * { color: ${to} !important; }
        * { background-color: ${to} !important; }
        * { border-color: ${to} !important; }
        /* ↑ you can be more specific or use CSS variables */
      `).join("\n");
  
    const styleTag = document.createElement("style");
    styleTag.id = "color‑rewriter‑style";
    styleTag.textContent = css;
    document.head.appendChild(styleTag);
  });
  