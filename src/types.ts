export type ColorMap = Record<string, string>;

export interface ThemeSettings {
  style: string;
  customDescription?: string;
  colorOverrides?: Record<string, string>;
}

export interface APIResponse {
  success: boolean;
  error?: string;
  data?: any;
}