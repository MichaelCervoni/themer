// filepath: c:\Users\Micha\Documents\Themer\src\api\ollama-api.ts
import type { ColorMap } from "../types";

/**
 * Fetch color palette from Ollama API
 */
export async function fetchFromOllama(colors: string[], style: string, customDesc?: string, ollamaBaseUrlFromSettings?: string, prompt?: string): Promise<ColorMap> {
  // Helper function that creates a mock palette when Ollama isn't available
  const createMockPalette = (): ColorMap => {
    console.log("BG (fetchFromOllama): Creating mock color palette");
    const mockResponse: ColorMap = {};
    colors.forEach(color => {
      if (style === "Dark") {
        mockResponse[color] = color === "rgb(255, 255, 255)" || color.toLowerCase() === "#ffffff" || color.toLowerCase() === "white" ? "#121212" : "#CCCCCC";
      } else if (style === "Light") {
         mockResponse[color] = color === "rgb(0, 0, 0)" || color.toLowerCase() === "#000000" || color.toLowerCase() === "black" ? "#FAFAFA" : "#444444";
      } else { // Custom or other
        const randomHue = customDesc?.includes("blue") ? 240 : customDesc?.includes("green") ? 120 : Math.floor(Math.random() * 360);
        mockResponse[color] = `hsl(${randomHue}, 70%, ${Math.random() > 0.5 ? '30%' : '80%'})`;
      }
    });
    return mockResponse;
  };

  // Use debug mode if explicitly requested
  if (ollamaBaseUrlFromSettings === "debug") {
    console.log("BG (fetchFromOllama): DEBUG MODE - Using mock color palette");
    return Promise.resolve(createMockPalette());
  }
  
  // Get a compatible model from available models
  async function getCompatibleModel(baseUrl: string): Promise<string> {
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`);
      if (!response.ok) {
        return "llama3"; // Default fallback
      }
      
      const data = await response.json();
      console.log("BG (getCompatibleModel): Available models:", data.models?.map((m: any) => m.name).join(", ") || "none found");
      
      // Try to find a suitable model in order of preference
      const preferredModels = [
        "llama3", "llama3:8b", "llama3:70b", 
        "llama2", "llama2:7b", "llama2:13b", "llama2:70b",
        "gemma", "gemma:7b", "gemma:2b", "gemma3", "gemma3:8b",
        "mistral", "mistral:7b", "mixtral", "phi", "phi:3b"
      ];
      
      if (Array.isArray(data.models)) {
        const availableModels = data.models.map((m: any) => m.name.toLowerCase());
        for (const model of preferredModels) {
          if (availableModels.includes(model) || availableModels.some((m: string) => m.startsWith(model))) {
            console.log(`BG (getCompatibleModel): Selected ${model} from available models`);
            return model;
          }
        }
        
        // If none of the preferred models are available, use the first available model
        if (data.models.length > 0) {
          console.log(`BG (getCompatibleModel): Using first available model: ${data.models[0].name}`);
          return data.models[0].name;
        }
      }
      
      return "llama3"; // Default fallback if no models found
    } catch (error) {
      console.error("BG (getCompatibleModel): Error getting available models:", error);
      return "llama3"; // Default fallback
    }
  }

  const baseOllamaUrl = ollamaBaseUrlFromSettings || "http://127.0.0.1:11434";
  const OLLAMA_API_URL = `${baseOllamaUrl.replace(/\/$/, '')}/api/chat`;
  console.log(`BG (fetchFromOllama): Attempting to fetch from Ollama API: ${OLLAMA_API_URL}`);
  
  // If the fetch fails, the user will see an error. Add this to check - the user might want to try debug mode first
  if (baseOllamaUrl !== "debug" && colors.length > 0) {
    console.log("BG (fetchFromOllama): Will create temporary mock palette if Ollama fails");
  }
  
  try {
    // First check if Ollama server is running with a simpler request
    console.log(`BG (fetchFromOllama): Testing connection to Ollama server: ${baseOllamaUrl}/api/tags`);
    
    // Get a compatible model via the same mechanism as our utility function
    let modelToUse = "llama3"; // Default model
    
    try {
      // Direct fetch without CORS/proxy since we're in background script
      const checkResponse = await fetch(`${baseOllamaUrl.replace(/\/$/, '')}/api/tags`, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      
      if (!checkResponse.ok) {
        console.error(`BG (fetchFromOllama): Ollama server returned status ${checkResponse.status} during connectivity check`);
        const errorBody = await checkResponse.text().catch(() => "Failed to read error body");
        console.error(`BG (fetchFromOllama): Error body: ${errorBody}`);
        throw new Error(`Ollama server returned status ${checkResponse.status} - ${errorBody}`);
      }
      
      const data = await checkResponse.json();
      
      if (data.models && Array.isArray(data.models) && data.models.length > 0) {
        // Find a suitable model
        const availableModels = data.models.map((m: any) => m.name);
        const preferredModels = [
          "llama3", "llama3:8b", "llama2:7b", "gemma:7b", "mistral:7b", "mixtral", "phi:3b"
        ];
        
        for (const model of preferredModels) {
          if (availableModels.includes(model) || availableModels.some((m: string) => m.startsWith(model.toLowerCase()))) {
            modelToUse = model;
            break;
          }
        }
        
        if (!preferredModels.includes(modelToUse) && !preferredModels.some(p => modelToUse.startsWith(p))) {
          // If we didn't find a preferred model, use the first available one
          modelToUse = availableModels[0];
        }
      }
      
      console.log(`BG (fetchFromOllama): Ollama server connectivity confirmed, using model: ${modelToUse}`);
    } catch (checkError) {
      console.error("BG (fetchFromOllama): Ollama server connectivity check failed:", checkError);
      // If test connectivity fails, return a mock palette instead of throwing
      console.warn("BG (fetchFromOllama): Falling back to mock palette due to connectivity error");
      return createMockPalette();
    }
    
    // Now send the actual chat request directly from the background script (no CORS issues here)
    console.log(`BG (fetchFromOllama): Sending chat request to: ${OLLAMA_API_URL} using model: ${modelToUse}`);
    const response = await fetch(OLLAMA_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        model: modelToUse,
        messages: [{ role: "user", content: prompt }],
        format: "json",
        stream: false
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`BG (fetchFromOllama): Ollama returned status ${response.status}. Body: ${errorText}`);
      // If the actual request fails, return a mock palette as fallback
      console.warn("BG (fetchFromOllama): Falling back to mock palette due to API error");
      return createMockPalette();
    }
    
    const data = await response.json();
    console.log("BG (fetchFromOllama): Raw LLM response:", data);
    
    if (!data.message) {
      console.error("BG (fetchFromOllama): Unexpected response format. Missing 'message' property:", data);
      if (data.error) {
        throw new Error(`Ollama error: ${data.error}`);
      }
      throw new Error("Unexpected response format from Ollama");
    }
    
    const content = data.message?.content || "";
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch || !jsonMatch[0]) {
      console.error("BG (fetchFromOllama): Failed to parse JSON object from LLM response content:", content);
      throw new Error("Failed to parse color map JSON from LLM response");
    }
    return JSON.parse(jsonMatch[0]);
  } catch (fetchError) {
    console.error("BG (fetchFromOllama): Fetch failed:", fetchError);
    throw fetchError; // Re-throw to be caught by handleRefreshPalette
  }
}