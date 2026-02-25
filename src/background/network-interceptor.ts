import { UsageMetadata, TokenEvent } from '../shared/types';

/**
 * Background Service Worker for Gemini Context Tracker.
 * 
 * NOTE: In Manifest V3, we cannot directly read response bodies using chrome.webRequest.
 * So, network interception occurs via a script injected into the MAIN world (main-world-interceptor.ts).
 * 
 * This background script acts as the orchestrator/state-manager:
 * - It listens for parsed usage metadata relayed by the content script.
 * - Records it in storage (useful for popup history, popup UI, or analytics).
 * - Relays the formatted TOKEN_UPDATE event back to the affected tab's UI (HUD).
 */

chrome.runtime.onInstalled.addListener(() => {
    console.log('Gemini Context Tracker Installed.');
});

chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'NETWORK_INTERCEPT_USAGE') {
        const usageData: UsageMetadata = message.data;
        console.log('Background received Token Usage:', usageData);

        // Relay back to the originating tab's content script to update the UI
        if (sender.tab?.id) {
            const tokenEvent: TokenEvent = {
                type: 'TOKEN_UPDATE',
                data: usageData,
                source: 'network'
            };

            // Store latest details globally if needed
            chrome.storage.local.set({ lastUsage: usageData });

            chrome.tabs.sendMessage(sender.tab.id, tokenEvent).catch(err => {
                console.warn('Failed to send message to tab', err);
            });
        }
    }
    return true; // Indicates we might respond asynchronously, though we don't right now
});
