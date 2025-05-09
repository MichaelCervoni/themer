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
  const [status, setStatus] = useState<{loading: boolean; error?: string}>({loading: false});
  
  // ── load current prefs ────────────────────────────────────────────
  useEffect(() => {
    browser.storage.local.get("settings").then((result) => {
      if (result.settings) {
        setSettings(result.settings);
      }
    });
  }, []);

  const saveAndApply = async () => {
    try {
      setStatus({loading: true});
      
      // Save settings
      await browser.storage.local.set({ settings });
      console.log("Saved settings:", settings);
      
      // Send message to apply changes
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]?.id) {
        throw new Error("No active tab found");
      }
      
      const response = await browser.runtime.sendMessage({
        type: "REFRESH_PALETTE",
        settings
      });
      
      console.log("Response from background:", response);
      
      if (!response.success) {
        throw new Error(response.error || "Failed to apply palette");
      }
      
      setStatus({loading: false});
      // Only close if successful
      window.close();
    } catch (error) {
      console.error("Error applying palette:", error);
      setStatus({loading: false, error: (error as Error).message || "Failed to apply palette"});    }
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
          disabled={status.loading}
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
          value={settings.customDescription || ""}
          onChange={(e) =>
            setSettings((s) => ({ ...s, customDescription: e.target.value }))
          }
          disabled={status.loading}
        />
      )}

      {status.error && (
        <div className="text-red-500 text-xs p-2 bg-red-50 rounded border border-red-200">
          Error: {status.error}
        </div>
      )}

      <button
        className={`w-full rounded py-1 ${
          status.loading 
            ? "bg-gray-400 text-white cursor-not-allowed" 
            : "bg-indigo-600 text-white hover:bg-indigo-700"
        }`}
        onClick={saveAndApply}
        disabled={status.loading}
      >
        {status.loading ? "Applying..." : "Apply"}
      </button>
    </div>
  );
}

// Render the component when the DOM is ready
createRoot(document.getElementById("root")!).render(<Popup />);