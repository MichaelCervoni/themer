/**
 * Utility for managing development API keys
 * This is useful during development to avoid entering keys repeatedly
 */

/**
 * Save a development OpenAI API key
 */
export async function saveDevOpenAIKey(key: string): Promise<{ success: boolean, error?: string }> {
  try {
    if (!key || typeof key !== 'string' || key.length < 10) {
      return { 
        success: false, 
        error: "Please provide a valid API key" 
      };
    }

    await browser.storage.local.set({ 
      DEV_OPENAI_KEY: key
    });
    
    return { 
      success: true
    };
  } catch (error) {
    console.error("Error saving development API key:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error saving key"
    };
  }
}

/**
 * Get the saved development OpenAI API key
 */
export async function getDevOpenAIKey(): Promise<string | undefined> {
  try {
    const data = await browser.storage.local.get("DEV_OPENAI_KEY");
    return data.DEV_OPENAI_KEY;
  } catch (error) {
    console.error("Error retrieving development API key:", error);
    return undefined;
  }
}

/**
 * Clear the saved development API key
 */
export async function clearDevOpenAIKey(): Promise<void> {
  try {
    await browser.storage.local.remove("DEV_OPENAI_KEY");
  } catch (error) {
    console.error("Error clearing development API key:", error);
  }
}