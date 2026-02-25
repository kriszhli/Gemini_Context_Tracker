import { TokenEvent, UsageMetadata } from '../shared/types';
import { FallbackScraper } from './fallback-scraper';

/**
 * Isolated Content Script.
 * Responsible for injecting the main world script, the Shadow DOM UI, and communicating with Background.
 */

class GeminiContextHUD {
    private container: HTMLElement;
    private shadowRoot: ShadowRoot;

    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'gemini-context-tracker-hud';

        // Open shadow dom to isolate CSS classes
        this.shadowRoot = this.container.attachShadow({ mode: 'open' });
        this.initUI();
        document.body.appendChild(this.container);
    }

    private initUI() {
        const style = document.createElement('style');
        style.textContent = `
      .hud-wrapper {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 320px;
        background: rgba(20, 20, 20, 0.95);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 16px;
        color: #e0e0e0;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        z-index: 2147483647; /* Highest z-index */
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        transition: all 0.3s ease;
      }
      .hud-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }
      .hud-title { 
        margin: 0; 
        font-size: 14px; 
        font-weight: 600; 
        color: #a8c7fa; 
        letter-spacing: 0.5px;
      }
      .stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 12px;
        font-size: 13px;
      }
      .stat-label { color: #888; font-size: 11px; text-transform: uppercase; }
      .stat-value { font-weight: 500; font-variant-numeric: tabular-nums; }
      
      .total-row { 
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
        font-size: 13px;
        font-weight: 600;
      }
      .progress-container { 
        width: 100%; 
        height: 6px; 
        background: rgba(255,255,255,0.1); 
        border-radius: 3px; 
        overflow: hidden; 
      }
      .progress-bar { 
        height: 100%; 
        background: #4caf50; 
        width: 0%; 
        transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s ease; 
      }
    `;

        const wrapper = document.createElement('div');
        wrapper.className = 'hud-wrapper';
        wrapper.innerHTML = `
      <div class="hud-header">
        <h3 class="hud-title">Context Window</h3>
      </div>
      <div class="stats-grid">
        <div>
          <div class="stat-label">Prompt</div>
          <div class="stat-value" id="prompt-tokens">0</div>
        </div>
        <div>
          <div class="stat-label">Candidates</div>
          <div class="stat-value" id="candidate-tokens">0</div>
        </div>
      </div>
      <div class="total-row">
        <span>Total Usage</span>
        <span><span id="total-tokens">0</span> / 1M</span>
      </div>
      <div class="progress-container">
        <div class="progress-bar" id="progress-bar"></div>
      </div>
    `;

        this.shadowRoot.appendChild(style);
        this.shadowRoot.appendChild(wrapper);
    }

    public updateTokens(event: TokenEvent) {
        const { promptTokenCount, candidatesTokenCount, totalTokenCount } = event.data;

        // Example fixed limit for 1M models. Later we can dynamically pull limits from src/shared/types.ts PLAN_LIMITS
        const MAX_LIMIT = 1048576;

        this.shadowRoot.getElementById('prompt-tokens')!.innerText = promptTokenCount.toLocaleString();
        this.shadowRoot.getElementById('candidate-tokens')!.innerText = candidatesTokenCount.toLocaleString();
        this.shadowRoot.getElementById('total-tokens')!.innerText = totalTokenCount.toLocaleString();

        const percentage = Math.min((totalTokenCount / MAX_LIMIT) * 100, 100);
        const progressBar = this.shadowRoot.getElementById('progress-bar') as HTMLElement;
        progressBar.style.width = `${percentage}%`;

        // Dynamic color threshold warning
        if (percentage > 90) {
            progressBar.style.backgroundColor = '#ff5252'; // Red limit alert
        } else if (percentage > 75) {
            progressBar.style.backgroundColor = '#ffb300'; // Orange warning
        } else {
            progressBar.style.backgroundColor = '#4caf50'; // Safe Green
        }
    }
}


function injectNetworkInterceptor() {
    const script = document.createElement('script');
    // Vite + CRX pattern: path refers to src file, bundler handles the mapping locally
    script.src = chrome.runtime.getURL('src/content/main-world-interceptor.ts');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
}

// 1. Setup Interceptor
injectNetworkInterceptor();

// 2. Setup HUD Overlay
const hud = new GeminiContextHUD();
const scraper = new FallbackScraper();

let lastUpdateSource: 'network' | 'fallback_estimate' | null = null;
let lastUpdateTimestamp = 0;

// Update UI wrapper
function updateUI(metadata: UsageMetadata, source: 'network' | 'fallback_estimate') {
    // If we recently got a network update, don't overwrite it with a fallback estimate immediately
    if (source === 'fallback_estimate' && lastUpdateSource === 'network' && (Date.now() - lastUpdateTimestamp < 5000)) {
        return; // Trust network more
    }

    lastUpdateSource = source;
    lastUpdateTimestamp = Date.now();

    hud.updateTokens({ type: 'TOKEN_UPDATE', data: metadata, source });
}

// 3. Listen for Main World Intercepts
window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== 'gemini-network-interceptor') {
        return;
    }

    const metadata: UsageMetadata = event.data.payload;
    updateUI(metadata, 'network');

    // Forward usage stats to Background Script for persistence/organization
    chrome.runtime.sendMessage({
        type: 'NETWORK_INTERCEPT_USAGE',
        data: metadata
    });
});

// 4. Setup DOM Mutation Observer as fallback
let mutationTimeout: number | null = null;
const observer = new MutationObserver(() => {
    // Debounce the scraping
    if (mutationTimeout) window.clearTimeout(mutationTimeout);
    mutationTimeout = window.setTimeout(() => {
        // Only scrape if we are not getting active network intercepts
        // We update fallback if we haven't seen a network update in 5 seconds
        if (lastUpdateSource !== 'network' || (Date.now() - lastUpdateTimestamp > 5000)) {
            const estimate = scraper.estimateTokens();
            // Only update if there are actually tokens found
            if (estimate.totalTokenCount > 0) {
                updateUI(estimate, 'fallback_estimate');
            }
        }
    }, 1000);
});

observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
});

// 5. Listen for Token Update broadcasts from Background Setup (e.g., from other tabs)
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TOKEN_UPDATE') {
        const event = message as TokenEvent;
        updateUI(event.data, event.source);
    }
});
