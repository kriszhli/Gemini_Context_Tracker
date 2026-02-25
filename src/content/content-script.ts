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
    this.setupDraggable();
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
        transition: width 0.3s ease, height 0.3s ease, border-radius 0.3s ease, padding 0.3s ease, background-color 0.3s ease;
        box-sizing: border-box;
        cursor: grab;
      }
      .hud-wrapper:active {
        cursor: grabbing;
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
        pointer-events: none;
      }
      .minimize-btn {
        background: transparent;
        border: none;
        color: #888;
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .minimize-btn:hover {
        color: #e0e0e0;
      }
      .stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 12px;
        font-size: 13px;
        transition: opacity 0.2s ease;
      }
      .stat-label { color: #888; font-size: 11px; text-transform: uppercase; }
      .stat-value { font-weight: 500; font-variant-numeric: tabular-nums; }
      
      .total-row { 
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
        font-size: 13px;
        font-weight: 600;
        transition: opacity 0.2s ease;
      }
      .progress-container { 
        width: 100%; 
        height: 6px; 
        background: rgba(255,255,255,0.1); 
        border-radius: 3px; 
        overflow: hidden; 
        transition: opacity 0.2s ease;
      }
      .progress-bar { 
        height: 100%; 
        background: #4caf50; 
        width: 0%; 
        transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s ease; 
      }

      /* Minimized State */
      .hud-wrapper.minimized {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .hud-wrapper.minimized .hud-header {
        margin: 0;
        width: 100%;
        height: 100%;
        justify-content: center;
      }
      .hud-wrapper.minimized .hud-title,
      .hud-wrapper.minimized .minimize-btn,
      .hud-wrapper.minimized .stats-grid,
      .hud-wrapper.minimized .total-row,
      .hud-wrapper.minimized .progress-container {
        display: none;
      }
      .minimized-content {
        display: none;
        font-weight: 700;
        font-size: 12px;
        pointer-events: none;
        text-align: center;
      }
      .hud-wrapper.minimized .minimized-content {
        display: block;
      }
    `;

    const wrapper = document.createElement('div');
    wrapper.className = 'hud-wrapper';
    wrapper.innerHTML = `
      <div class="hud-header" id="hud-header">
        <h3 class="hud-title">Context Window</h3>
        <button class="minimize-btn" id="minimize-btn" title="Minimize">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 15l-7-7-7 7"/></svg>
        </button>
        <div class="minimized-content" id="minimized-text">0</div>
      </div>
      <div class="stats-grid">
        <div>
          <div class="stat-label">User</div>
          <div class="stat-value" id="prompt-tokens">0</div>
        </div>
        <div>
          <div class="stat-label">Gemini</div>
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

    const minimizeBtn = this.shadowRoot.getElementById('minimize-btn')!;
    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      wrapper.classList.add('minimized');
    });

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

    // Format for small circle (e.g. 1.2k, 1M)
    const formatSmall = (num: number) => {
      if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
      if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
      return num.toString();
    };
    this.shadowRoot.getElementById('minimized-text')!.innerText = formatSmall(totalTokenCount);

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

  private setupDraggable() {
    const wrapper = this.shadowRoot.querySelector('.hud-wrapper') as HTMLElement;

    let isDragging = false;
    let hasDragged = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let startMouseX = 0;
    let startMouseY = 0;

    let currentX = 0;
    let currentY = 0;

    const dragStart = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('#minimize-btn')) return;

      isDragging = true;
      hasDragged = false;
      const rect = wrapper.getBoundingClientRect();

      startMouseX = e.clientX;
      startMouseY = e.clientY;

      // Calculate offset from current mouse position to wrapper's top-left
      dragStartX = e.clientX - rect.left;
      dragStartY = e.clientY - rect.top;

      // Temporarily disable transition during drag for smoothness
      wrapper.style.transition = 'none';

      e.preventDefault();
    };

    const dragAction = (e: MouseEvent) => {
      if (!isDragging) return;

      e.preventDefault();

      if (Math.abs(e.clientX - startMouseX) > 3 || Math.abs(e.clientY - startMouseY) > 3) {
        hasDragged = true;
      }

      currentX = e.clientX - dragStartX;
      currentY = e.clientY - dragStartY;

      // Boundaries
      const maxX = window.innerWidth - wrapper.offsetWidth;
      const maxY = window.innerHeight - wrapper.offsetHeight;

      currentX = Math.max(0, Math.min(currentX, maxX));
      currentY = Math.max(0, Math.min(currentY, maxY));

      // Need to unset bottom/right initially set by CSS to allow left/top to work
      wrapper.style.right = 'auto';
      wrapper.style.bottom = 'auto';
      wrapper.style.left = `${currentX}px`;
      wrapper.style.top = `${currentY}px`;
    };

    const dragEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      // Restore transition for minimize/expand animations
      wrapper.style.transition = 'width 0.3s ease, height 0.3s ease, border-radius 0.3s ease, padding 0.3s ease, background-color 0.3s ease';
    };

    wrapper.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', dragAction);
    document.addEventListener('mouseup', dragEnd);

    wrapper.addEventListener('click', (e) => {
      if (hasDragged) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (wrapper.classList.contains('minimized')) {
        wrapper.classList.remove('minimized');
      }
    });
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
  console.log('[Gemini Tracker isolated script] Received metadata from interceptor:', metadata);
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
  mutationTimeout = window.setTimeout(async () => {
    // Only scrape if we are not getting active network intercepts
    // We update fallback if we haven't seen a network update in 5 seconds
    if (lastUpdateSource !== 'network' || (Date.now() - lastUpdateTimestamp > 5000)) {
      const estimate = await scraper.estimateTokens();
      console.log('[Gemini Tracker isolated script] Fallback estimate produced:', estimate);
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
