/**
 * Helper utility to diagnose firewall and connectivity issues
 */

/**
 * Attempts to check if there are firewall or connection issues with reaching Ollama
 */
export async function checkFirewallIssues(baseUrl: string = "http://127.0.0.1:11434"): Promise<{
  accessible: boolean,
  firewallIssue: boolean,
  urlIssue: boolean,
  serverRunning: boolean,
  otherIssue: boolean,
  message: string,
  details: string
}> {
  console.log(`Checking firewall issues for ${baseUrl}...`);
  
  // Default response
  const result = {
    accessible: false,
    firewallIssue: false,
    urlIssue: false,
    serverRunning: false,
    otherIssue: false,
    message: "Unknown error",
    details: ""
  };
  
  // First check if we can reach Google (to confirm general internet connectivity)
  let internetWorks = false;
  try {
    const googleResponse = await fetch("https://www.google.com/generate_204", {
      method: "GET",
      mode: "no-cors" // This might allow the request to succeed even if content can't be read
    });
    internetWorks = true;
    result.details += "✓ Internet connectivity check: PASSED\n";
  } catch (error) {
    result.details += "✗ Internet connectivity check: FAILED\n";
    result.details += `  Error: ${error instanceof Error ? error.message : String(error)}\n`;
  }
  
  // Check if the URL is valid
  let validUrl = true;
  try {
    new URL(baseUrl);
  } catch (error) {
    validUrl = false;
    result.urlIssue = true;
    result.message = `Invalid URL: ${baseUrl}`;
    result.details += `✗ URL validation: FAILED\n`;
    result.details += `  Error: Invalid URL format\n`;
    return result;
  }
  
  // Check with background script proxy
  try {
    const proxyResult = await browser.runtime.sendMessage({
      type: "OLLAMA_SYSTEM_CHECK",
      url: baseUrl + "/api/tags"
    });
    
    if (proxyResult.success) {
      result.accessible = true;
      result.serverRunning = true;
      result.message = "Ollama is accessible";
      result.details += "✓ Ollama server check: PASSED\n";
      result.details += `  Status: ${proxyResult.status} ${proxyResult.statusText || ""}\n`;
      
      if (proxyResult.models && proxyResult.models.length > 0) {
        result.details += `  Models: ${proxyResult.models.join(", ")}\n`;
      } else {
        result.details += "  No models found (you may need to run 'ollama pull llama3')\n";
      }
      
      return result;
    } else {
      result.details += "✗ Ollama server check: FAILED\n";
      result.details += `  Error: ${proxyResult.error || "Unknown error"}\n`;
      
      // Try to determine if this is a firewall issue
      if (proxyResult.error && proxyResult.error.includes("NetworkError when attempting to fetch resource")) {
        result.firewallIssue = true;
        result.message = "Network error - Possible firewall or connectivity issue";
        result.details += "  This looks like a firewall issue or Ollama is not running\n";
      }
    }
  } catch (error) {
    result.details += "✗ Background script proxy check: FAILED\n";
    result.details += `  Error: ${error instanceof Error ? error.message : String(error)}\n`;
    result.otherIssue = true;
  }
  
  // Check alternative hostnames
  const altHost = baseUrl.includes("localhost") ? 
    baseUrl.replace("localhost", "127.0.0.1") : 
    baseUrl.replace("127.0.0.1", "localhost");
  
  try {
    const altResult = await browser.runtime.sendMessage({
      type: "OLLAMA_SYSTEM_CHECK",
      url: altHost + "/api/tags"
    });
    
    if (altResult.success) {
      result.accessible = true;
      result.serverRunning = true;
      result.urlIssue = true;
      result.message = `Ollama is accessible via ${altHost} instead of ${baseUrl}`;
      result.details += `✓ Alternative host check (${altHost}): PASSED\n`;
      return result;
    } else {
      result.details += `✗ Alternative host check (${altHost}): FAILED\n`;
      result.details += `  Error: ${altResult.error || "Unknown error"}\n`;
    }
  } catch (error) {
    result.details += `✗ Alternative host check: FAILED\n`;
    result.details += `  Error: ${error instanceof Error ? error.message : String(error)}\n`;
  }
  
  // Final analysis
  if (!internetWorks) {
    result.message = "No internet connectivity - Check browser network settings";
    result.otherIssue = true;
  } else if (result.firewallIssue) {
    result.message = "Possible firewall blocking Ollama connections";
  } else {
    result.serverRunning = false;
    result.message = "Ollama server not running or not accessible";
  }
  
  result.details += "\nRecommendations:\n";
  result.details += "1. Ensure Ollama is installed and running ('ollama serve' command)\n";
  result.details += "2. Check firewall settings to allow Firefox to access localhost:11434\n";
  result.details += "3. Try using 'debug' as the URL in settings to work offline\n";
  
  return result;
}