import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

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
    browser.storage.local.get(["style", "customDescription"]).then((res) => {
      setSettings({
        style: (res.style as Settings["style"]) ?? "Original",
        customDescription: res.customDescription ?? "",
      });
    });
  }, []);

  // ── helpers ───────────────────────────────────────────────────────
  const saveAndApply = async () => {
    await browser.storage.local.set(settings);
    // ping background so it refreshes the palette
    browser.runtime.sendMessage({ type: "REFRESH_PALETTE" });
    window.close();
  };

  const onSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const style = e.target.value as Settings["style"];
    setSettings((s) => ({ ...s, style }));
  };

  return (
    <div className="p-3 text-sm space-y-3">
      <label className="block font-medium">Palette</label>
      <select
        className="w-full border rounded p-1"
        value={settings.style}
        onChange={onSelect}
      >
        {[
          "Original",
          "Light",
          "Dark",
          "Custom", // free‑text
        ].map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>

      {settings.style === "Custom" && (
        <textarea
          className="w-full border rounded p-1"
          rows={3}
          placeholder="Describe your palette (e.g. ‘pastel sunset’)"
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