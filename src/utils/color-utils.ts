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

/**
 * Convert a hex color string to an RGB array.
 * @param hex The hex color string (e.g., "#RRGGBB").
 * @returns An array [r, g, b] or null if conversion fails.
 */
export function hexToRgb(hex: string): [number, number, number] | null {
  if (!hex || typeof hex !== 'string') {
    return null;
  }
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, (m, r, g, b) => {
    return r + r + g + g + b + b;
  });

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
      ]
    : null;
}

/**
 * Calculate the relative luminance of an RGB color.
 * Formula from WCAG 2.1: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 * @param r Red value (0-255)
 * @param g Green value (0-255)
 * @param b Blue value (0-255)
 * @returns The relative luminance (0-1).
 */
export function getLuminance(r: number, g: number, b: number): number {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

/**
 * Calculate the contrast ratio between two RGB colors.
 * Formula from WCAG 2.1: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 * @param rgb1 First color as [r, g, b]
 * @param rgb2 Second color as [r, g, b]
 * @returns The contrast ratio.
 */
export function getContrastRatio(
  rgb1: [number, number, number],
  rgb2: [number, number, number]
): number {
  const lum1 = getLuminance(rgb1[0], rgb1[1], rgb1[2]);
  const lum2 = getLuminance(rgb2[0], rgb2[1], rgb2[2]);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}