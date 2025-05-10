// Add this function to background.ts to fix the build error

/**
 * Check if a color is light based on its brightness
 */
function isLightColor(color: string): boolean {
  try {
    let r = 0, g = 0, b = 0;
    
    if (color.startsWith('#')) {
      const hex = color.replace('#', '');
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    } else if (color.startsWith('rgb')) {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
        r = parseInt(match[1]);
        g = parseInt(match[2]);
        b = parseInt(match[3]);
      }
    }
    
    // Calculate perceived brightness
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128; // Above 128 is considered light
  } catch (e) {
    return false; // If we can't determine, assume it's not light
  }
}

/**
 * Get a darker version of a color
 */
function getDarkerVersion(color: string): string {
  try {
    let r = 0, g = 0, b = 0;
    
    if (color.startsWith('#')) {
      const hex = color.replace('#', '');
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    } else if (color.startsWith('rgb')) {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
        r = parseInt(match[1]);
        g = parseInt(match[2]);
        b = parseInt(match[3]);
      }
    }
    
    // Make the color darker by reducing each component
    r = Math.max(r * 0.3, 0);
    g = Math.max(g * 0.3, 0);
    b = Math.max(b * 0.3, 0);
    
    // Convert back to hex
    return `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`;
  } catch (e) {
    return "#121212"; // If we can't parse the color, return a default dark color
  }
}