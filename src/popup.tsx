import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

// Keys we keep in browser.storage.local
interface Settings {
  style: "Original" | "Light" | "Dark" | "Custom";
  customDescription?: string;
}

const DEFAULTS: Settings = { style: "Original" };

function Popup() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  // ── load current prefs ────────────────────────────────────────────
  useEffect(() => {
    browser.storage.local.get("settings").then((result) => {
      if (result.settings) {
        setSettings(result.settings);
      }
    });
  }, []);

  // ── helpers ───────────────────────────────────────────────────────
  const saveAndApply = async () => {
    await browser.storage.local.set({ settings });
    // Send message to apply changes
    await browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs[0]?.id) {
        browser.tabs.sendMessage(tabs[0].id, { type: "REFRESH_PALETTE" });
      }
    });
    window.close();
  };

  const onSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const style = e.target.value as Settings["style"];
    setSettings((s) => ({ ...s, style }));
  };

  return (
    <div className="p-3 text-sm space-y-3">
      <div>
        <label className="block mb-1">Palette</label>
        <select 
          className="w-full border rounded p-1" 
          value={settings.style}
          onChange={onSelect}
        >
          <option value="Original">Original</option>
          <option value="Light">Light</option>
          <option value="Dark">Dark</option>
          <option value="Custom">Custom...</option>
        </select>
      </div>

      {settings.style === "Custom" && (
        <textarea
          className="w-full border rounded p-1"
          rows={3}
          placeholder="Describe your palette (e.g. 'pastel sunset')"
          value={settings.customDescription}
          onChange={(e) =>
            setSettings((s) => ({ ...s, customDescription: e.target.value }))
          }
        />
      )}

      <button
        className="w-full rounded bg-indigo-600 text-white py-1 hover:bg-indigo-700"
        onClick={saveAndApply}
      >
        Apply
      </button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Popup />);