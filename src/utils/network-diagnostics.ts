/**
 * Network diagnostics utility functions
 */

/**
 * Tests various network connections to help diagnose issues 
 * with connecting to Ollama
 */
export async function runNetworkDiagnostics(url: string = "http://127.0.0.1:11434/api/tags"): Promise<{
  success: boolean,
  results: {
    [key: string]: any
  }
}> {
  console.log("Running network diagnostics for:", url);
  
  const results: Record<string, any> = {
    targetUrl: url,
    timestamp: new Date().toISOString(),
    tests: {}
  };
  
  // Test 1: Test direct connection to Ollama
  try {
    const directResponse = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });
    
    results.tests.direct = {
      success: directResponse.ok,
      status: directResponse.status,
      statusText: directResponse.statusText
    };
    
    try {
      const text = await directResponse.text();
      results.tests.direct.bodyLength = text.length;
      if (text.length > 0) {
        results.tests.direct.bodySample = text.substring(0, 100) + (text.length > 100 ? "..." : "");
      }
    } catch (e) {
      results.tests.direct.bodyError = String(e);
    }
  } catch (error) {
    results.tests.direct = {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }

  // Test 2: Try localhost vs 127.0.0.1
  const alternativeUrl = url.includes("localhost") 
    ? url.replace("localhost", "127.0.0.1")
    : url.replace("127.0.0.1", "localhost");
    
  try {
    const altResponse = await fetch(alternativeUrl, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });
    
    results.tests.alternative = {
      url: alternativeUrl,
      success: altResponse.ok,
      status: altResponse.status,
      statusText: altResponse.statusText
    };
  } catch (error) {
    results.tests.alternative = {
      url: alternativeUrl,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
  
  // Test 3: Internet connectivity check
  try {
    const googleResponse = await fetch("https://www.google.com/generate_204", {
      method: "GET"
    });
    
    results.tests.internet = {
      success: googleResponse.status === 204,
      status: googleResponse.status,
      statusText: googleResponse.statusText
    };
  } catch (error) {
    results.tests.internet = {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
  
  // Test 4: Try alternative ports
  const urlObj = new URL(url);
  const currentPort = urlObj.port || (urlObj.protocol === "https:" ? "443" : "80");
  const alternativePorts = ["11434", "8000", "8080", "3000"].filter(p => p !== currentPort);
  
  results.tests.alternativePorts = { tried: [] as any[] };
  
  for (const port of alternativePorts) {
    const portUrl = `${urlObj.protocol}//${urlObj.hostname}:${port}/api/tags`;
    try {
      const portResponse = await fetch(portUrl, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      
      results.tests.alternativePorts.tried.push({
        port,
        url: portUrl,
        success: portResponse.ok,
        status: portResponse.status,
        statusText: portResponse.statusText
      });
    } catch (error) {
      results.tests.alternativePorts.tried.push({
        port,
        url: portUrl,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  // Determine overall success
  const anySuccess = results.tests.direct?.success || 
                     results.tests.alternative?.success ||
                     results.tests.alternativePorts?.tried?.some((t: any) => t.success);
  
  results.success = anySuccess;
  results.internetConnectivity = results.tests.internet?.success || false;
  
  console.log("Network diagnostics complete:", results);
  
  return {
    success: anySuccess,
    results
  };
}