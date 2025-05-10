// filepath: c:\Users\Micha\Documents\Themer\src\popup-new.tsx
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import type { ColorMap } from "./types";
import "./styles.css";

// Add error boundary to catch rendering errors
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error?: Error}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Popup Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding: "16px", textAlign: "center"}}>
          <h3>Something went wrong</h3>
          <p style={{color: "red"}}>{this.state.error?.message || "Unknown error"}</p>
          <button onClick={() => browser.runtime.openOptionsPage()}>
            Open Options
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface PopupState {
  styles: string[];
  currentStyle: string;
  customDescription: string;
  loading: boolean;
  message: string;
  error: string;
  activeTab: browser.tabs.Tab | null;
  colorOverrides: Record<string, string>;
}

function Popup() {
  const [state, setState] = useState<PopupState>({
    styles: ["Original", "Dark", "Light", "Solarized", "Nord", "Custom"],
    currentStyle: "Dark",
    customDescription: "",
    loading: false,
    message: "",
    error: "",
    activeTab: null,
    colorOverrides: {}
  });

  useEffect(() => {
    // Get the active tab when the popup opens
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs[0]) {
        setState(s => ({ ...s, activeTab: tabs[0] }));
        
        // Get current settings for this tab's TLD
        browser.runtime.sendMessage({
          type: "GET_ACTIVE_SETTINGS_FOR_TLD",
          tabId: tabs[0].id,
          url: tabs[0].url
        }).then((settings) => {
          if (settings) {
            setState(s => ({
              ...s,
              currentStyle: settings.style || s.currentStyle,
              customDescription: settings.customDescription || s.customDescription,
              colorOverrides: settings.colorOverrides || s.colorOverrides
            }));
          }
        }).catch(err => {
          console.error("Error getting active settings:", err);
        });
      }
    });
  }, []);

  const applyTheme = async () => {
    setState(s => ({ ...s, loading: true, error: "", message: "" }));
    
    try {
      if (!state.activeTab?.id) {
        throw new Error("No active tab");
      }
      
      const result = await browser.runtime.sendMessage({
        type: "REFRESH_PALETTE",
        targetTab: state.activeTab,
        settings: {
          style: state.currentStyle,
          customDescription: state.customDescription,
          colorOverrides: state.colorOverrides
        }
      });
      
      if (result.success) {
        setState(s => ({ 
          ...s, 
          loading: false, 
          message: "Theme applied successfully" 
        }));
        setTimeout(() => setState(s => ({ ...s, message: "" })), 2000);
      } else {
        throw new Error(result.error || "Unknown error");
      }
    } catch (error) {
      console.error("Error applying theme:", error);
      setState(s => ({ 
        ...s, 
        loading: false, 
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  };

  const openOptions = () => {
    browser.runtime.openOptionsPage();
  };

  return (
    <div className="p-3">
      <h3 className="text-center mb-4">Color Rewriter</h3>

      {state.error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded mb-4">
          {state.error}
        </div>
      )}

      {state.message && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-3 py-2 rounded mb-4">
          {state.message}
        </div>
      )}

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Theme Style</label>
        <select
          className="w-full p-2 border rounded"
          value={state.currentStyle}
          onChange={(e) => setState(s => ({ ...s, currentStyle: e.target.value }))}
        >
          {state.styles.map((style) => (
            <option key={style} value={style}>
              {style}
            </option>
          ))}
        </select>
      </div>

      {state.currentStyle === "Custom" && (
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Custom Description</label>
          <input
            type="text"
            className="w-full p-2 border rounded"
            placeholder="e.g., blue cyberpunk theme"
            value={state.customDescription}
            onChange={(e) =>
              setState(s => ({ ...s, customDescription: e.target.value }))
            }
          />
        </div>
      )}

      <div className="flex space-x-2">
        <button
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded"
          onClick={applyTheme}
          disabled={state.loading}
        >
          {state.loading ? "Applying..." : "Apply Theme"}
        </button>
        <button
          className="bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded"
          onClick={openOptions}
        >
          ⚙️
        </button>
      </div>
    </div>
  );
}

// Render the component when the DOM is ready
const rootDiv = document.getElementById("root");
if (rootDiv) {
  createRoot(rootDiv).render(
    <ErrorBoundary>
      <Popup />
    </ErrorBoundary>
  );
} else {
  console.error("Root element not found for popup");
}