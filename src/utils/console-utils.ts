/**
 * Console utility functions for development
 * These can be called from the browser console to manage development keys
 */

/**
 * Save a development OpenAI API key from the browser console
 * Usage in console: await saveDevKey('your-openai-key-here')
 */
export async function saveDevKey(key: string): Promise<void> {
  if (!key || typeof key !== 'string') {
    console.error('Please provide a valid API key string');
    return;
  }
  
  try {
    console.log('Attempting to save development API key...');
    const result = await browser.runtime.sendMessage({
      type: 'SET_DEV_OPENAI_KEY',
      key
    });
    
    if (result.success) {
      console.log('✓ Development API key saved successfully!');
      console.log('You can now use OpenAI provider without setting a key in options.');
    } else {
      console.error('✗ Failed to save development API key:', result.error);
    }
  } catch (error) {
    console.error('✗ Error saving development API key:', error);
  }
}

/**
 * Check if a development key is set
 * Usage in console: await checkDevKey()
 */
export async function checkDevKey(): Promise<void> {
  try {
    const data = await browser.storage.local.get('DEV_OPENAI_KEY');
    if (data.DEV_OPENAI_KEY) {
      console.log('✓ Development API key is set');
      console.log('Key starts with:', data.DEV_OPENAI_KEY.substring(0, 5) + '...');
    } else {
      console.log('✗ No development API key is set');
      console.log('Use saveDevKey("your-key") to set one');
    }
  } catch (error) {
    console.error('Error checking development API key:', error);
  }
}

/**
 * Clear the saved development API key
 * Usage in console: await clearDevKey()
 */
export async function clearDevKey(): Promise<void> {
  try {
    await browser.storage.local.remove('DEV_OPENAI_KEY');
    console.log('✓ Development API key cleared');
  } catch (error) {
    console.error('Error clearing development API key:', error);
  }
}

// Make these functions available in the window object for console use
declare global {
  interface Window {
    saveDevKey: typeof saveDevKey;
    checkDevKey: typeof checkDevKey;
    clearDevKey: typeof clearDevKey;
    themer: {
      saveDevKey: typeof saveDevKey;
      checkDevKey: typeof checkDevKey;
      clearDevKey: typeof clearDevKey;
    };
  }
}

// Always expose for development
try {
  // Use themer namespace to avoid polluting global scope
  window.themer = window.themer || {};
  window.themer.saveDevKey = saveDevKey;
  window.themer.checkDevKey = checkDevKey;
  window.themer.clearDevKey = clearDevKey;
  
  // Also expose directly for convenience
  window.saveDevKey = saveDevKey;
  window.checkDevKey = checkDevKey;
  window.clearDevKey = clearDevKey;
  
  console.log('[Themer] Development utilities loaded. Use saveDevKey("your-key") to store an OpenAI key.');
} catch (e) {
  console.warn('Could not expose development utilities on window:', e);
}