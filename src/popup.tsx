import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import type { ColorMap } from "./types"; // Assuming you have this from background or a shared types file
import "./styles.css";

// Keys we keep in browser.storage.local (ensure this matches background.ts)
const STORAGE_KEYS = {
  SAVED_PALETTES_BY_TLD: "savedPalettesByTld",
  TLD_ACTIVE_SETTINGS: "tldActiveSettings",
  PROVIDER_SETTINGS: ["provider", "ollamaUrl", "openaiKey", "claudeKey"],
  CURRENT_PALETTE: "currentPalette"
};

interface Settings {
  style: "Original" | "Light" | "Dark" | "Custom";
  customDescription?: string;
  colorOverrides?: Record<string, string>;
}

const DEFAULTS: Settings = { style: "Original", colorOverrides: {} };

function Popup() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [status, setStatus] = useState<{loading: boolean; error?: string}>({loading: false});
  const [palette, setPalette] = useState<{original: string, replacement: string}[]>([]);
  const [activeTab, setActiveTab] = useState<browser.tabs.Tab | null>(null); // Store the full tab object
  
  // Load current preferences and palette
  useEffect(() => {
    // Load general settings and current palette for display
    browser.storage.local.get(["settings", STORAGE_KEYS.CURRENT_PALETTE]).then((result) => {
      if (result.settings) {
        setSettings(s => ({ ...s, ...result.settings }));
      }
      if (result[STORAGE_KEYS.CURRENT_PALETTE]) {
        const currentPaletteMap = result[STORAGE_KEYS.CURRENT_PALETTE] as ColorMap;
        setPalette(Object.entries(currentPaletteMap).map(([original, replacement]) => ({ original, replacement })));
      }
    }).catch(e => console.error("Error loading initial settings/palette from storage:", e));
    
    // Get active tab and its TLD-specific settings
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs[0]) {
        setActiveTab(tabs[0]); // Store the full tab object
        if (tabs[0].url) {
          // Request active settings for the TLD of the current tab
          browser.runtime.sendMessage({ type: "GET_ACTIVE_SETTINGS_FOR_TLD" }) // Relies on sender.tab in background
            .then(activeTldSettings => {
              if (activeTldSettings) {
                setSettings(prev => ({
                  ...prev, // Keep existing general settings or DEFAULTS
                  style: activeTldSettings.style || prev.style,
                  customDescription: activeTldSettings.customDescription === undefined ? prev.customDescription : activeTldSettings.customDescription,
                  colorOverrides: activeTldSettings.colorOverrides || prev.colorOverrides || {},
                }));
                if (activeTldSettings.palette) {
                  const paletteArray = Object.entries(activeTldSettings.palette as ColorMap).map(([original, replacement]) => ({ original, replacement }));
                  setPalette(paletteArray);
                }
              }
            }).catch(e => console.error("Error getting active TLD settings in popup:", e));
        }
      } else {
        console.error("No active tab found.");
        setStatus({loading: false, error: "No active tab found."});
      }
    }).catch(e => {
      console.error("Error querying active tab:", e);
      setStatus({loading: false, error: "Could not get active tab information."});
    });
  }, []);
  
  const saveAndApply = async () => {
    setStatus({ loading: true, error: undefined });
    try {
      let tabToRefresh = activeTab;

      // If activeTab from state is somehow invalid or missing, try to re-query
      if (!tabToRefresh || !tabToRefresh.id || !tabToRefresh.url) {
        console.warn("Active tab from state is invalid, re-querying...");
        const currentTabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (currentTabs[0] && currentTabs[0].id && currentTabs[0].url) {
          tabToRefresh = currentTabs[0];
          setActiveTab(tabToRefresh); // Update state
        } else {
          throw new Error("Active tab information is missing or invalid. Cannot apply palette.");
        }
      }

      // Save the current popup settings (general, not TLD specific)
      // TLD specific settings are managed by the background script upon successful palette application.
      await browser.storage.local.set({ settings: { style: settings.style, customDescription: settings.customDescription, colorOverrides: settings.colorOverrides } });

      const response = await browser.runtime.sendMessage({
        type: "REFRESH_PALETTE",
        settings: settings, // Send the current settings from the popup
        targetTab: tabToRefresh // Pass the full tab object
      });

      if (response && response.success) {
        console.log("Palette refresh initiated successfully by popup.");
        // The background script now saves to CURRENT_PALETTE, so we can re-fetch it to update UI
        const updatedStorage = await browser.storage.local.get(STORAGE_KEYS.CURRENT_PALETTE);
        if (updatedStorage[STORAGE_KEYS.CURRENT_PALETTE]) {
          const newPaletteMap = updatedStorage[STORAGE_KEYS.CURRENT_PALETTE] as ColorMap;
          setPalette(Object.entries(newPaletteMap).map(([original, replacement]) => ({ original, replacement })));
        }
      } else {
        throw new Error(response?.error || "Failed to refresh palette via background script");
      }
    } catch (err) {
      console.error("Error in saveAndApply:", err);
      setStatus({ loading: false, error: (err as Error).message });
    } finally {
      setStatus({ loading: false });
    }
  };

  const onSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStyle = e.target.value as Settings["style"];
    setSettings(s => ({ ...s, style: newStyle, customDescription: newStyle === "Custom" ? s.customDescription : undefined }));
  };
  
  const handleColorOverride = (originalColor: string, newColor: string) => {
    setSettings(s => {
      const newOverrides = { ...s.colorOverrides };
      if (newColor && newColor !== originalColor) {
        newOverrides[originalColor] = newColor;
      } else {
        delete newOverrides[originalColor]; // Remove override if new color is empty or same as original
      }
      return { ...s, colorOverrides: newOverrides };
    });
  };

  const openOptions = () => {
    browser.runtime.openOptionsPage();
  };

  // Basic JSX structure, assuming you have these components/styles
  return (
    <div className="p-3 space-y-3 text-sm" style={{width: '250px'}}> {/* Ensure width is applied if not in CSS */}
      <select value={settings.style} onChange={onSelect} className="w-full border rounded p-1">
        <option value="Original">Original Site Colors</option>
        <option value="Light">Light Mode</option>
        <option value="Dark">Dark Mode</option>
        <option value="Custom">Custom AI Palette</option>
      </select>

      {settings.style === "Custom" && (
        <input
          type="text"
          placeholder="Describe custom style (e.g., 'ocean blue theme')"
          value={settings.customDescription || ""}
          onChange={(e) => setSettings(s => ({ ...s, customDescription: e.target.value }))}
          className="w-full border rounded p-1"
        />
      )}

      <button onClick={saveAndApply} disabled={status.loading} className="w-full bg-indigo-600 text-white py-1 rounded hover:bg-indigo-700 disabled:bg-gray-400">
        {status.loading ? "Applying..." : "Save & Apply"}
      </button>

      {status.error && <p className="text-red-500 text-xs p-2 bg-red-50 border border-red-200 rounded">{status.error}</p>}

      {palette.length > 0 && (
        <div className="max-h-64 overflow-y-auto space-y-1">
          <h3 className="font-medium">Current Palette:</h3>
          {palette.map(({ original, replacement }) => (
            <div key={original} className="grid grid-cols-2 gap-2 items-center">
              <div className="truncate" style={{ color: original, backgroundColor: '#f0f0f0', padding: '2px' }} title={original}>{original}</div>
              <input 
                type="color" 
                value={settings.colorOverrides?.[original] || replacement} 
                onChange={(e) => handleColorOverride(original, e.target.value)}
                className="p-0 border-0 w-full h-6"
                title="Override color"
              />
            </div>
          ))}
        </div>
      )}
      <button onClick={openOptions} className="w-full text-center text-xs py-1 mt-2 text-indigo-600 hover:underline">
        Options
      </button>
    </div>
  );
}

// Render the component when the DOM is ready
const rootDiv = document.getElementById("root");
if (rootDiv) {
  createRoot(rootDiv).render(<Popup />);
} else {
  console.error("Root element not found for popup");
}