// filepath: c:\Users\Micha\Documents\Themer\src\utils\network-diagnostics-fixed.ts

/**
 * Utility functions for running network diagnostics
 */

/**
 * Run network diagnostics for Ollama connectivity
 */
export async function runNetworkDiagnostics(baseUrl: string = "http://127.0.0.1:11434"): Promise<{
  success: boolean;
  results: Record<string, any>;
  summary: string;
}> {
  try {
    const results = await browser.runtime.sendMessage({
      type: "NETWORK_DIAGNOSTICS",
      url: baseUrl
    });

    let success = false;
    let summary = "";

    // Determine success based on test results
    if (results.success === false) {
      summary = "Diagnostics failed to run: " + (results.error || "Unknown error");
    } else if (results.tests?.directFetch?.success || results.tests?.alternateHost?.success) {
      success = true;
      summary = "Connection to Ollama server was successful. Server is reachable.";
      
      if (results.tests?.directFetch?.success) {
        summary += " Direct connection worked.";
      } else {
        summary += " Alternative host connection worked.";
      }
    } else {
      summary = "Failed to connect to Ollama server. Please check:\n" +
        "1. Is Ollama running? Run 'ollama serve' in terminal.\n" +
        "2. Try using http://localhost:11434 or http://127.0.0.1:11434\n" +
        "3. Check if there's a firewall blocking the connection.";
    }

    return {
      success,
      results,
      summary
    };
  } catch (error) {
    return {
      success: false,
      results: { error: String(error) },
      summary: `Error running diagnostics: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Check if a network connection is available
 */
export async function checkInternetConnection(): Promise<boolean> {
  try {
    const response = await fetch("https://www.google.com/generate_204", { 
      method: "GET",
      mode: "no-cors",
      cache: "no-store"
    });
    return response.status === 204 || response.type === "opaque";
  } catch (error) {
    console.error("Internet connection check failed:", error);
    return false;
  }
}

/**
 * Get detailed information about a connection failure
 */
export async function getConnectionFailureDetails(url: string): Promise<string> {
  try {
    // Try to fetch with a short timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));
    
    // If we reach here, the connection succeeded
    return "Connection succeeded unexpectedly";
  } catch (error: unknown) {
    // Proper type handling for unknown error
    if (error instanceof DOMException && error.name === "AbortError") {
      return "Connection timed out after 3 seconds";
    }
    
    // Try to get more detailed error info
    if (error instanceof TypeError) {
      if (error.message.includes("Failed to fetch")) {
        return "Network error: Could not establish connection. Server may be down or blocked.";
      } else if (error.message.includes("NetworkError")) {
        return "Network error: Possibly CORS related or server not found.";
      }
    }
    
    // For any other type of error
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : "Unknown";
    
    return `Error: ${errorName} - ${errorMessage}`;
  }
}