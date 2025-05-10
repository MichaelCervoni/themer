import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { checkOllamaAvailability } from "./utils/ollama-helper";

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
  };  // Function to debug the connection by testing all approaches and showing results
  const debugOllamaConnection = async (url: string) => {
    const results: string[] = [];
    let directFetchSuccess = false;
    let proxySuccess = false;
    
    // Test 1: Direct fetch (will fail due to CORS, but shows the error)
    try {
      results.push("1. Testing direct fetch (expected to fail due to CORS)");
      const directResponse = await fetch(`${url.replace(/\/$/, '')}/api/tags`, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      results.push(`✓ Direct fetch succeeded (unexpected): ${directResponse.status} ${directResponse.statusText}`);
      directFetchSuccess = true;
    } catch (error) {
      results.push(`✗ Direct fetch failed as expected: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Test 2: Background script proxy
    try {
      results.push("\n2. Testing background script proxy (should succeed)");
      const proxyResponse = await browser.runtime.sendMessage({
        type: "OLLAMA_PROXY",
        url: `${url.replace(/\/$/, '')}/api/tags`,
        method: "GET"
      });
      
      if (proxyResponse.ok || proxyResponse.success) {
        results.push(`✓ Proxy fetch succeeded: ${proxyResponse.status || '200'}`);
        proxySuccess = true;
        
        // Try to parse models
        try {
          const data = proxyResponse.data || JSON.parse(proxyResponse.text);
          const modelCount = data.models?.length || 0;
          results.push(`✓ Found ${modelCount} models: ${data.models?.map((m: any) => m.name).join(", ") || "none"}`);
        } catch (e) {
          results.push(`✗ Could not parse models from response: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else {
        results.push(`✗ Proxy fetch failed: ${proxyResponse.error || 'Unknown error'}`);
        results.push(`Full error details: ${JSON.stringify(proxyResponse)}`);
      }
    } catch (error) {
      results.push(`✗ Proxy message error: ${error instanceof Error ? error.message : String(error)}`);
    }
      // Test 3: System-level check
    results.push("\n3. System-level check (should succeed):");
    try {
      const sysResponse = await browser.runtime.sendMessage({
        type: "OLLAMA_SYSTEM_CHECK",
        url: `${url.replace(/\/$/, '')}/api/tags`,
      });
      
      if (sysResponse.success) {
        results.push(`✓ System check succeeded: status ${sysResponse.status || '200'}`);
        
        if (sysResponse.models && sysResponse.models.length) {
          results.push(`✓ Models found: ${sysResponse.models.join(", ")}`);
        } else {
          results.push("✗ No models found on server");
        }
      } else {
        results.push(`✗ System check failed: ${sysResponse.error || 'Unknown error'}`);
      }
    } catch (error) {
      results.push(`✗ System check error: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Summary
    results.push("\nSummary:");
    results.push(`Direct fetch: ${directFetchSuccess ? "✓ Success (unexpected)" : "✗ Failed (expected due to CORS)"}`);
    results.push(`Proxy via background: ${proxySuccess ? "✓ Success" : "✗ Failed (this is the issue)"}`);
    
    // Technical details
    results.push("\nTechnical Info:");
    results.push(`Browser/Runtime available: ${!!browser && !!browser.runtime ? "Yes" : "No"}`);
    results.push(`URL being tested: ${url}`);
    results.push(`Extension ID: ${browser.runtime.id || "unknown"}`);
    
    return results.join("\n");
  };
  
  const testConnection = async () => {
    try {
      // Use the current state for the URL, as that's what the user is configuring
      const baseUrlToTest = state.ollamaUrl || "http://127.0.0.1:11434"; // Default if not set in state
      
      console.log("Testing connection to:", baseUrlToTest);
      
      // First save the settings to ensure they're used for future requests
      await browser.storage.local.set({
        provider: state.provider,
        ollamaUrl: state.ollamaUrl,
        openaiKey: state.openaiKey,
        claudeKey: state.claudeKey
      });
      console.log("Settings saved before connection test");

      if (baseUrlToTest === "debug") {
        alert("Debug mode enabled. Mock data will be used instead of real API calls.");
        return;
      }
      
      // Run the debug test first
      const debugResults = await debugOllamaConnection(baseUrlToTest);
      console.log("Debug results:", debugResults);
      
      // Show a detailed alert with debug info
      alert(`Testing connection to ${baseUrlToTest}...\n\n${debugResults}`);
      
      // Use our utility function to check Ollama availability as before
      const result = await checkOllamaAvailability(baseUrlToTest);
      
      if (result.available) {
        if (result.models && result.models.length > 0) {
          alert(`Connection successful! Available models: ${result.models.join(", ")}`);
        } else {
          alert("Connection successful but no models were found. Please install models with 'ollama pull llama3' or similar.");
        }
      } else {
        throw new Error(result.error || "Unknown connection error");
      }
    } catch (error) {
      console.error("Connection test failed:", error);
      alert(`Error: ${error instanceof Error ? error.message : String(error)}\n\nPlease check:\n1. Is Ollama running?\n2. Is the URL correct? (try http://127.0.0.1:11434)\n3. Or use "debug" as URL to use mock data instead`);
    }
  };
  // Network diagnostics function removed due to TypeScript errors

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
          </div>      <div className="flex space-x-2">
        <button
          type="button"
          onClick={testConnection}
          className="mt-2 rounded bg-blue-500 text-white py-1 px-4 hover:bg-blue-600"
        >
          Test Ollama Connection
        </button>
        
        <button
          type="button"          onClick={async () => {
            try {
              const baseUrl = state.ollamaUrl || "http://127.0.0.1:11434";
              
              alert("Running network diagnostics. This may take a moment...");
              
              // Import the firewall check utility dynamically
              const { checkFirewallIssues } = await import('./utils/firewall-check');
              const diagnostics = await checkFirewallIssues(baseUrl);
              
              if (diagnostics.accessible) {
                alert("Connection successful!\n\n" + diagnostics.message + "\n\n" + diagnostics.details);
              } else {
                alert("Connection failed: " + diagnostics.message + 
                      "\n\n" + diagnostics.details +
                      "\n\nQuick Fixes:" +
                      "\n1. Make sure Ollama is running (run 'ollama serve' in terminal)" + 
                      "\n2. Check Windows/Mac firewall settings" +
                      "\n3. Try 'debug' as URL to use mock data instead");
              }
            } catch (error) {
              alert("Error running diagnostics: " + (error instanceof Error ? error.message : String(error)));
            }
          }}
          className="mt-2 rounded bg-gray-500 text-white py-1 px-4 hover:bg-gray-600"
        >
          Network Diagnostics
        </button>
      </div>          {/* Network Diagnostics button removed due to TypeScript errors */}
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