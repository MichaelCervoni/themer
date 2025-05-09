import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

type Provider = "ollama" | "openai" | "claude";

interface OptState {
  provider: Provider;
  openaiKey?: string;
  claudeKey?: string;
  ollamaUrl?: string; // fallback if user changed port
}

const INITIAL: OptState = { provider: "ollama" };

function Options() {
  const [state, setState] = useState<OptState>(INITIAL);
  const [saved, setSaved] = useState(false);

  // ── load ──────────────────────────────────────────────────────────
  useEffect(() => {
    browser.storage.local
      .get(["provider", "openaiKey", "claudeKey", "ollamaUrl"])
      .then((res) => setState({ ...INITIAL, ...res } as OptState));
  }, []);

  const save = async () => {
    await browser.storage.local.set(state);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const testConnection = async () => {
    try {
      // Use the current state for the URL, as that's what the user is configuring
      const baseUrlToTest = state.ollamaUrl || "http://127.0.0.1:11434"; // Default if not set in state
      // Ensure the base URL is clean and append /api/tags
      const testUrl = `${baseUrlToTest.replace(/\/$/, '')}/api/tags`; 
      
      console.log("Testing connection to:", testUrl);
      
      const response = await fetch(testUrl, {
        method: "GET"
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} ${await response.text()}`);
      }

      const text = await response.text();
      console.log("Response:", text);
      alert(`Connection successful! Response: ${text.substring(0, 100)}...`);
    } catch (error) {
      console.error("Connection test failed:", error);
      alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <fieldset>
        <legend className="font-medium mb-1">LLM Provider</legend>
        {(
          [
            { id: "ollama", label: "Local Ollama" },
            { id: "openai", label: "OpenAI" },
            { id: "claude", label: "Anthropic Claude" },
          ] as const
        ).map(({ id, label }) => (
          <label key={id} className="block">
            <input
              type="radio"
              name="provider"
              value={id}
              checked={state.provider === id}
              onChange={() => setState((s) => ({ ...s, provider: id }))}
            />
            <span className="ml-2">{label}</span>
          </label>
        ))}
      </fieldset>

      {state.provider === "ollama" && (
        <div>
          <label className="block font-medium mb-1">Ollama Base URL</label>
          <input
            type="url"
            className="w-full border rounded p-1"
            value={state.ollamaUrl ?? "http://localhost:11434"}
            onChange={(e) =>
              setState((s) => ({ ...s, ollamaUrl: e.target.value }))
            }
          />
          <div className="text-xs mt-1 text-gray-600">
            Enter "debug" to use mock responses for testing. Example: http://127.0.0.1:11434
          </div>
          <button
            type="button"
            onClick={testConnection}
            className="mt-2 rounded bg-blue-500 text-white py-1 px-4 hover:bg-blue-600"
          >
            Test Ollama Connection
          </button>
        </div>
      )}

      {state.provider === "openai" && (
        <div>
          <label className="block font-medium mb-1">OpenAI API Key</label>
          <input
            type="password"
            className="w-full border rounded p-1"
            value={state.openaiKey ?? ""}
            onChange={(e) =>
              setState((s) => ({ ...s, openaiKey: e.target.value }))
            }
          />
        </div>
      )}

      {state.provider === "claude" && (
        <div>
          <label className="block font-medium mb-1">Claude API Key</label>
          <input
            type="password"
            className="w-full border rounded p-1"
            value={state.claudeKey ?? ""}
            onChange={(e) =>
              setState((s) => ({ ...s, claudeKey: e.target.value }))
            }
          />
        </div>
      )}

      <button
        type="submit"
        className="rounded bg-indigo-600 text-white py-1 px-4 hover:bg-indigo-700"
      >
        Save
      </button>
      {saved && <span className="text-green-700 ml-3">✔ Saved!</span>}
    </form>
  );
}

createRoot(document.getElementById("root")!).render(<Options />);