// filepath: c:\Users\Micha\Documents\Themer\src\utils\color-utils.ts
/**
 * Utility functions for working with colors
 */

/**
 * Check if a color is light based on its brightness
 */
export function isLightColor(color: string): boolean {
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
export function getDarkerVersion(color: string): string {
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

/**
 * Get a lighter version of a color
 */
export function getLighterVersion(color: string): string {
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
    
    // Make the color lighter by increasing each component
    r = Math.min(r + (255 - r) * 0.7, 255);
    g = Math.min(g + (255 - g) * 0.7, 255);
    b = Math.min(b + (255 - b) * 0.7, 255);
    
    // Convert back to hex
    return `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`;
  } catch (e) {
    return "#F0F0F0"; // If we can't parse the color, return a default light color
  }
}

/**
 * Check if a color map represents a dark theme
 */
export function isDarkTheme(colorMap: Record<string, string>): boolean {
  // Count dark colors in the color map
  let darkColorCount = 0;
  let totalColors = 0;
  
  for (const targetColor of Object.values(colorMap)) {
    if (!targetColor) continue;
    totalColors++;
    
    try {
      // Check if the hex color has low brightness (simple method)
      if (targetColor.startsWith('#')) {
        const hex = targetColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        // Calculate perceived brightness
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        if (brightness < 128) {
          darkColorCount++;
        }
      }
    } catch (e) {
      // Skip this color if we can't parse it
    }
  }
  
  // If more than 30% of colors are dark, consider it a dark theme
  return totalColors > 0 && (darkColorCount / totalColors) > 0.3;
}