# Color Rewriter

**Color Rewriter** is a browser extension that swaps site colors with AI-generated palettes.

## Features
- Replace website colors with custom palettes.
- Supports multiple styles: Original, Light, Dark, and Custom.
- Integrates with OpenAI, Anthropic Claude, and local Ollama for palette generation.

## Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/color-rewriter.git
   cd color-rewriter

2. Install dependencies:
```
pnpm install
```

3. Build the extension:
```
pnpm build
```

4. Load the extension in your browser:
Firefox:
Open about:debugging in Firefox.
Click "This Firefox" > "Load Temporary Add-on".
Select the manifest.json file from the dist folder.
Chrome (if Manifest V3 is supported):
Open chrome://extensions/.
Enable Developer mode.
Click "Load unpacked" and select the dist folder.

## Development
To start a development server with hot-reloading:
```
pnpm dev
```

## Project Structure
src/: Source code for the extension.
popup.tsx: The popup UI.
options.tsx: The options/settings page.
background.ts: Background script for handling messages.
content.ts: Content script for collecting colors.
painter.ts: Applies the color replacements.
public/: Static files like popup.html and options.html.
dist/: Build output.
Configuration
Update API keys and URLs in the options page.
Modify vite.config.mts for custom build settings.
License
This project is licensed under the MIT License.