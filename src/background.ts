// background.ts
import type { ColorMap } from "./types";

const OLLAMA_URL = "http://localhost:11434/api/chat";
async function fetchPalette(colors: string[], style: string): Promise<ColorMap> {
  const prompt = `
    You are a color‑replacement assistant.
    Given these colors: ${JSON.stringify(colors)}
    and the desired style "${style}",
    return ONLY a JSON object mapping each original
    color (as given) to a hex replacement.
  `;
  const body = {
    model: "llama3",
    messages: [{ role: "user", content: prompt }],
    format: "json"
  };
  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" }
  });
  const text = await res.text();                     // Ollama streams; easier to read as text
  const jsonBlob = text.slice(text.indexOf("{"));    // crude stream‑to‑json clip
  return JSON.parse(jsonBlob) as ColorMap;
}

browser.runtime.onMessage.addListener(async (msg, _sender) => {
  if (msg.type !== "COLOR_SET") return;
  const style = (await browser.storage.local.get("style")).style || "Light";
  const map = await fetchPalette(msg.payload, style);
  browser.tabs.sendMessage(_sender.tab!.id!, { type: "APPLY_MAP", payload: map });
});
