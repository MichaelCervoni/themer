console.log("Options page script loading (vanilla version)");

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded in options-vanilla.ts");
  
  // Get DOM elements
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    console.error("No root element found");
    return;
  }
  
  // Replace the loading message with our actual UI
  rootElement.innerHTML = `
    <div style="max-width: 800px; margin: 0 auto; padding: 20px;">
      <h1 style="font-size: 24px; margin-bottom: 20px;">Color Rewriter Options</h1>
      
      <div id="status-message" style="margin-bottom: 20px; padding: 10px; display: none;"></div>
      
      <div style="margin-bottom: 20px;">
        <label for="provider" style="display: block; margin-bottom: 5px; font-weight: bold;">AI Provider</label>
        <select id="provider" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
          <option value="openai">OpenAI</option>
          <option value="claude">Anthropic Claude</option>
          <option value="ollama">Ollama (Local)</option>
        </select>
      </div>
      
      <div id="openai-fields">
        <div style="margin-bottom: 20px;">
          <label for="openai-key" style="display: block; margin-bottom: 5px; font-weight: bold;">OpenAI API Key</label>
          <input type="password" id="openai-key" placeholder="sk-..." style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
          <p style="margin-top: 4px; color: #666; font-size: 14px;">
            Get your API key from <a href="https://platform.openai.com/account/api-keys" target="_blank">OpenAI's website</a>
          </p>
        </div>
      </div>
      
      <div id="claude-fields" style="display: none;">
        <div style="margin-bottom: 20px;">
          <label for="claude-key" style="display: block; margin-bottom: 5px; font-weight: bold;">Claude API Key</label>
          <input type="password" id="claude-key" placeholder="sk-ant-..." style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
          <p style="margin-top: 4px; color: #666; font-size: 14px;">
            Get your API key from <a href="https://console.anthropic.com/" target="_blank">Anthropic's console</a>
          </p>
        </div>
      </div>
      
      <div id="ollama-fields" style="display: none;">
        <div style="margin-bottom: 20px;">
          <label for="ollama-url" style="display: block; margin-bottom: 5px; font-weight: bold;">Ollama URL</label>
          <input type="text" id="ollama-url" placeholder="http://localhost:11434" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
          <p style="margin-top: 4px; color: #666; font-size: 14px;">
            Default: http://localhost:11434
          </p>
        </div>
        
        <div style="margin-bottom: 20px;">
          <button id="test-ollama" style="background: #4169e1; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
            Test Connection
          </button>
          <div id="ollama-status" style="margin-top: 10px;"></div>
        </div>
      </div>
      
      <button id="save-btn" style="background: #4169e1; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">
        Save Settings
      </button>
    </div>
  `;
  
  // Get references to the new DOM elements
  const providerSelect = document.getElementById("provider") as HTMLSelectElement | null;
  const openaiFields = document.getElementById("openai-fields");
  const claudeFields = document.getElementById("claude-fields");
  const ollamaFields = document.getElementById("ollama-fields");
  const openaiKeyInput = document.getElementById("openai-key") as HTMLInputElement | null;
  const claudeKeyInput = document.getElementById("claude-key") as HTMLInputElement | null;
  const ollamaUrlInput = document.getElementById("ollama-url") as HTMLInputElement | null;
  const testOllamaBtn = document.getElementById("test-ollama");
  const ollamaStatus = document.getElementById("ollama-status");
  const saveBtn = document.getElementById("save-btn");
  const statusMessage = document.getElementById("status-message");

  // Check if all essential elements exist
  if (!providerSelect || !openaiKeyInput || !saveBtn) {
    console.error("Critical DOM elements are missing");
    showErrorInPage("Could not initialize options page. Please try reloading.");
    return;
  }
  
  // Show/hide fields based on selected provider
  providerSelect.addEventListener("change", () => {
    const selectedProvider = providerSelect.value;
    
    if (openaiFields) openaiFields.style.display = selectedProvider === "openai" ? "block" : "none";
    if (claudeFields) claudeFields.style.display = selectedProvider === "claude" ? "block" : "none";
    if (ollamaFields) ollamaFields.style.display = selectedProvider === "ollama" ? "block" : "none";
  });
  
  // Load saved settings
  browser.storage.local
    .get(["provider", "openaiKey", "claudeKey", "ollamaUrl"])
    .then((res) => {
      console.log("Loaded settings:", res);
      
      if (res.provider && providerSelect) {
        providerSelect.value = res.provider;
        // Trigger the change event to show/hide fields
        providerSelect.dispatchEvent(new Event("change"));
      }
      
      if (res.openaiKey && openaiKeyInput) {
        openaiKeyInput.value = res.openaiKey;
      }
      
      if (res.claudeKey && claudeKeyInput) {
        claudeKeyInput.value = res.claudeKey;
      }
      
      if (ollamaUrlInput) {
        ollamaUrlInput.value = res.ollamaUrl || "http://localhost:11434";
      }
    })
    .catch((err) => {
      console.error("Error loading settings:", err);
      showStatus("Error loading settings: " + (err.message || "Unknown error"), "error");
    });
  
  // Test Ollama connection
  if (testOllamaBtn && ollamaStatus && ollamaUrlInput) {
    testOllamaBtn.addEventListener("click", async () => {
      ollamaStatus.textContent = "Testing connection...";
      ollamaStatus.style.color = "blue";
      
      try {
        const url = ollamaUrlInput.value || "http://localhost:11434";
        
        // Simple fetch to check if Ollama is responding
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${url}/api/tags`, { 
          signal: controller.signal 
        }).finally(() => clearTimeout(timeoutId));
        
        if (response.ok) {
          ollamaStatus.textContent = "✓ Connected to Ollama successfully";
          ollamaStatus.style.color = "green";
        } else {
          ollamaStatus.textContent = `✗ Could not connect to Ollama (Status: ${response.status})`;
          ollamaStatus.style.color = "red";
        }
      } catch (error) {
        ollamaStatus.textContent = `✗ Connection error: ${error instanceof Error ? error.message : "Unknown error"}`;
        ollamaStatus.style.color = "red";
      }
    });
  }
  
  // Save settings
  saveBtn.addEventListener("click", async () => {
    try {
      const settings = {
        provider: providerSelect.value,
        openaiKey: openaiKeyInput.value,
        claudeKey: claudeKeyInput?.value || "",
        ollamaUrl: ollamaUrlInput?.value || "http://localhost:11434"
      };
      
      await browser.storage.local.set(settings);
      showStatus("Settings saved successfully!", "success");
    } catch (error) {
      console.error("Error saving settings:", error);
      showStatus("Error saving settings: " + (error instanceof Error ? error.message : "Unknown error"), "error");
    }
  });
  
  // Helper function to show status messages
  function showStatus(message: string, type: "success" | "error") {
    if (!statusMessage) return;
    
    statusMessage.textContent = message;
    statusMessage.style.display = "block";
    statusMessage.style.padding = "10px";
    statusMessage.style.borderRadius = "4px";
    
    if (type === "success") {
      statusMessage.style.backgroundColor = "#d4edda";
      statusMessage.style.color = "#155724";
      statusMessage.style.border = "1px solid #c3e6cb";
    } else {
      statusMessage.style.backgroundColor = "#f8d7da";
      statusMessage.style.color = "#721c24";
      statusMessage.style.border = "1px solid #f5c6cb";
    }
    
    // Hide the message after 3 seconds
    setTimeout(() => {
      if (statusMessage) statusMessage.style.display = "none";
    }, 3000);
  }
  
  // Function to show error in page when critical elements are missing
  function showErrorInPage(message: string) {
    if (rootElement) {
      rootElement.innerHTML = `
        <div style="max-width: 800px; margin: 0 auto; padding: 20px; text-align: center;">
          <h1 style="font-size: 24px; margin-bottom: 20px;">Error</h1>
          <div style="padding: 16px; background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; border-radius: 4px;">
            ${message}
          </div>
          <button onclick="window.location.reload()" style="margin-top: 20px; background: #4169e1; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">
            Reload Page
          </button>
        </div>
      `;
    }
  }
});

// Try immediate execution as well
if (document.readyState === "complete" || document.readyState === "interactive") {
  console.log("Document already ready, dispatching DOMContentLoaded event manually");
  document.dispatchEvent(new Event("DOMContentLoaded"));
}