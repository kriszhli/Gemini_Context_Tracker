# Gemini Context Tracker

A developer-focused, open-source Chrome Extension designed to track and visualize the context window usage on `gemini.google.com`. 

## Features

- **Real-time Token Tracking:** Intercepts internal Gemini API requests to extract precise token usage data (`promptTokenCount`, `candidatesTokenCount`, etc.) from the backend responses.
- **Floating HUD:** An unobtrusive, floating Heads-Up Display injected directly into the Gemini UI using Shadow DOM to avoid CSS conflicts.
- **Dynamic Limit Visualization:** Shows visual warnings (Green → Orange → Red) as your prompt approaches common model limits (e.g., 1M or 2M tokens).
- **DOM Scraping Fallback:** When network interception is unavailable, falling back to `js-tiktoken` (cl100k_base) to estimate prompt and candidate tokens directly from the page DOM.
- **Multimodal Heuristics:** The fallback mode accounts for image usage (~258 tokens per image) and attempts to estimate video usage.

## Architecture

This extension uses **Manifest V3** with TypeScript and Vite. It addresses strict MV3 limitations around intercepting response bodies by using a **Main World Interface** strategy.

### Structure

- `manifest.json`: Configuration, using declarativeNetRequest, scripting, and storage.
- `src/background/network-interceptor.ts`: Service worker managing state and coordinating event limits between the page and extension.
- `src/content/main-world-interceptor.ts`: Script injected into the **main world** of `gemini.google.com`. It patches `window.fetch` to parse `usageMetadata` from responses and post them back to the isolated content script via `window.postMessage`.
- `src/content/content-script.ts`: Isolated script that deploys the Shadow Root UI and handles the `MutationObserver` layout changes.
- `src/content/fallback-scraper.ts`: A scraper utilizing `js-tiktoken` for offline token estimation.

## Development

### Prerequisites

- Node.js (v18+)
- npm or pnpm

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/kriszhli/Gemini_Context_Tracker.git
   cd Gemini_Context_Tracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```
   *For live development, you can use `npm run dev` to watch for changes conditionally (with Vite config adjustments).*

### Installing the Extension for Testing

1. Open Google Chrome.
2. Navigate to `chrome://extensions/`.
3. Enable **Developer mode** via the top-right toggle.
4. Click **Load unpacked**.
5. Select the `dist/` directory inside your cloned repository.
6. Navigate to [gemini.google.com](https://gemini.google.com/) to see the HUD in action.

## Contributing

Contributions are welcome! If you have suggestions or improvements (e.g., better CSS selectors for the DOM fallback, or logic for identifying actual video lengths), please feel free to open an issue or submit a Pull Request.

## License

MIT License. See [LICENSE](LICENSE) for more details.
