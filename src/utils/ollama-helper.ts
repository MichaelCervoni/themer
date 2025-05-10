/**
 * Utility functions for working with Ollama
 */

/**
 * Checks if the Ollama server is running and accessible
 * @param baseUrl The base URL for the Ollama server
 * @returns A promise that resolves to information about Ollama availability
 */
export async function checkOllamaAvailability(baseUrl: string = "http://127.0.0.1:11434"): Promise<{available: boolean, models?: string[], error?: string, debug?: any}> {
  try {
    console.log(`Checking Ollama availability at: ${baseUrl}`);
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    const testUrl = `${cleanBaseUrl}/api/tags`;
    
    // Use the background script as a proxy to bypass CORS restrictions
    console.log("Using background script proxy to avoid CORS issues");
    
    // Check if browser.runtime is available
    if (!browser || !browser.runtime) {
      console.error("Proxy request failed: browser.runtime is not available");
      return {
        available: false,
        error: "Browser runtime or extension messaging API not available",
        debug: { browserExists: !!browser, runtimeExists: !!(browser && browser.runtime) }
      };
    }
    
    // Check if browser.runtime.sendMessage is available
    if (!browser.runtime.sendMessage) {
      console.error("Proxy request failed: browser.runtime.sendMessage is not available");
      return {
        available: false,
        error: "Browser runtime messaging API not available",
        debug: { browserExists: !!browser, runtimeExists: !!(browser && browser.runtime), sendMessageExists: !!(browser && browser.runtime && browser.runtime.sendMessage) }
      };
    }
    
    // Add timeout to avoid waiting forever
    const timeoutPromise = new Promise<{available: false, error: string}>((_, reject) => {
      setTimeout(() => reject({
        available: false,
        error: "Timeout waiting for response from background script (10 seconds)"
      }), 10000);
    });
    
    // Send message to background script with timeout
    const messagePromise = browser.runtime.sendMessage({
      type: "OLLAMA_PROXY",
      url: testUrl,
      method: "GET",
      headers: { "Accept": "application/json" }
    }).then(proxyResponse => {
      console.log("Received response from proxy:", proxyResponse);
      
      if (!proxyResponse) {
        console.error("Proxy request failed: Empty response");
        return {
          available: false,
          error: "Empty response from proxy",
          debug: { proxyResponse }
        };
      }
      
      if (!proxyResponse.success && !proxyResponse.ok) {
        console.error("Proxy request failed:", proxyResponse.error || "Unknown error");
        return {
          available: false,
          error: proxyResponse.error || `Failed to connect (${proxyResponse.status || 'Unknown error'})`,
          debug: { proxyResponse }
        };
      }
      
      // Try to extract data from response
      let data: any;
      try {
        if (proxyResponse.data) {
          data = proxyResponse.data;
        } else if (proxyResponse.text) {
          data = JSON.parse(proxyResponse.text);
        } else {
          throw new Error("No data or text in response");
        }
      } catch (e) {
        console.error("Failed to parse proxy response:", e);
        return {
          available: false,
          error: `Failed to parse response: ${e instanceof Error ? e.message : String(e)}`,
          debug: { proxyResponse, responseType: typeof proxyResponse, responseKeys: Object.keys(proxyResponse) }
        };
      }
      
      console.log("Parsed data from proxy:", data);
      
      if (!data.models || !Array.isArray(data.models) || data.models.length === 0) {
        return {
          available: true,
          models: [],
          error: "No models found on the server",
          debug: { data }
        };
      }
      
      return {
        available: true,
        models: data.models.map((m: any) => m.name),
        debug: { data }
      };
    }).catch(error => {
      console.error("Error in proxy request:", error);
      return {
        available: false,
        error: error instanceof Error ? error.message : String(error),
        debug: { error }
      };
    });
    
    // Race between message and timeout
    return Promise.race([messagePromise, timeoutPromise]);  } catch (error) {
    console.error("Error checking Ollama availability:", error);
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error),
      debug: { errorObject: error }
    };
  }
}

/**
 * Finds the best available model from a list of preferred models
 */
export function findBestModel(availableModels: string[]): string {
  // Lower-case all models for case-insensitive comparison
  const lowerCaseModels = availableModels.map(m => m.toLowerCase());
  
  // Models in order of preference
  const preferredModels = [
    "llama3", "llama3:8b", "llama3:70b",
    "llama2", "llama2:7b", "llama2:13b", "llama2:70b",
    "gemma", "gemma:7b", "gemma:2b", "gemma3", "gemma3:8b",
    "mistral", "mistral:7b", 
    "mixtral", 
    "phi", "phi:3b"
  ];
  
  // Find the first preferred model that's available
  for (const model of preferredModels) {
    if (lowerCaseModels.includes(model) || lowerCaseModels.some(m => m.startsWith(model))) {
      // Return the original casing of the matched model
      const index = lowerCaseModels.findIndex(m => m === model || m.startsWith(model));
      return availableModels[index];
    }
  }
  
  // If none of our preferred models are available, return the first available model
  return availableModels[0];
}