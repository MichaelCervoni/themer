import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

// Keys we keep in browser.storage.local
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
  const [activeTab, setActiveTab] = useState<number | null>(null);
  
  // Load current preferences and palette
  useEffect(() => {
    // Load settings
    browser.storage.local.get(["settings", "currentPalette"]).then((result) => {
      if (result.settings) {
        setSettings(result.settings);
      }
      if (result.currentPalette) {
        const paletteEntries = Object.entries(result.currentPalette).map(
          ([original, replacement]) => ({original, replacement: String(replacement)})
        );
        setPalette(paletteEntries);
      }
    });
    
    // Get active tab ID
    browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
      if (tabs[0]?.id) setActiveTab(tabs[0].id);
    });
  }, []);
  
  const saveAndApply = async () => {
    try {
      setStatus({loading: true});
      
      // Save settings
      await browser.storage.local.set({ settings });
      
      // Apply overrides to palette if we have any
      let finalPalette = {};
      if (palette.length > 0 && settings.colorOverrides) {
        finalPalette = Object.fromEntries(palette.map(({original, replacement}) => {
          // Use override if available, otherwise use the generated replacement
          const overrideColor = settings.colorOverrides?.[original];
          return [original, overrideColor || replacement];
        }));
      }
      
      // Send message to apply changes
      const response = await browser.runtime.sendMessage({
        type: "REFRESH_PALETTE",
        settings,
        colorOverrides: settings.colorOverrides
      });
      
      if (!response) {
        throw new Error("No response from background script");
      }
      
      if (!response.success) {
        throw new Error(response.error || "Failed to apply palette");
      }
      
      setStatus({loading: false});
      // Only close if successful and not in edit mode
      // window.close();
    } catch (error) {
      console.error("Error applying palette:", error);
      setStatus({loading: false, error: (error as Error).message || "Failed to apply palette"});
    }
  };

  const onSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const style = e.target.value as Settings["style"];
    setSettings((s) => ({ ...s, style }));
  };
  
  const handleColorOverride = (originalColor: string, newColor: string) => {
    setSettings(s => ({
      ...s,
      colorOverrides: {
        ...(s.colorOverrides || {}),
        [originalColor]: newColor
      }
    }));
  };

  const openOptions = () => {
    browser.runtime.openOptionsPage();
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
      
      {/* Color Palette Display */}
      {palette.length > 0 && (
        <div>
          <h3 className="font-medium mb-2">Color Palette</h3>
          <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
            {palette.map(({original, replacement}, idx) => {
              const overrideColor = settings.colorOverrides?.[original];
              const finalColor = overrideColor || replacement;
              
              return (
                <div key={idx} className="flex items-center">
                  <div className="flex-1">
                    <div className="color-preview border" style={{backgroundColor: original}}></div>
                    <div className="text-xs truncate">{original}</div>
                  </div>
                  <div className="mx-1">→</div>
                  <div className="flex-1">
                    <label className="color-preview border" style={{backgroundColor: finalColor}}>
                      <input 
                        type="color" 
                        className="opacity-0 absolute" 
                        value={finalColor}
                        onChange={(e) => handleColorOverride(original, e.target.value)}
                      />
                    </label>
                    <div className="text-xs truncate">{finalColor}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-xs text-center mt-2">
            Click on right color to override
          </div>
        </div>
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
      
      <div className="text-xs text-center mt-3">
        <button 
          onClick={openOptions}
          className="text-blue-600 hover:text-blue-800 hover:underline"
        >
          Options
        </button>
      </div>
    </div>
  );
}

// Render the component when the DOM is ready
createRoot(document.getElementById("root")!).render(<Popup />);