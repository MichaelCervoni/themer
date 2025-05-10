/**
 * Utility functions for managing development API keys
 */

/**
 * Save an OpenAI API key for development purposes
 */
export async function saveDevOpenAIKey(key: string): Promise<{ success: boolean, error?: string }> {
  if (!key || key.length < 10 || !key.startsWith("sk-")) {
    return { success: false, error: "Invalid API key format. OpenAI keys should start with 'sk-'" };
  }
  
  try {
    await browser.runtime.sendMessage({
      type: "SET_DEV_OPENAI_KEY",
      key
    });
    
    return { success: true };
  } catch (error) {
    console.error("Error saving dev OpenAI key:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error saving key" 
    };
  }
}

/**
 * Get the development OpenAI API key from storage
 */
export async function getDevOpenAIKey(): Promise<string | undefined> {
  try {
    const result = await browser.storage.local.get("DEV_OPENAI_KEY");
    return result.DEV_OPENAI_KEY;
  } catch (error) {
    console.error("Error retrieving dev OpenAI key:", error);
    return undefined;
  }
}

/**
 * Clear the development OpenAI API key from storage
 */
export async function clearDevOpenAIKey(): Promise<{ success: boolean, error?: string }> {
  try {
    await browser.storage.local.remove("DEV_OPENAI_KEY");
    return { success: true };
  } catch (error) {
    console.error("Error clearing dev OpenAI key:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error clearing key"
    };
  }
}