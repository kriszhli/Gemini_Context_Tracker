/**
 * MAIN World Script.
 * Overrides the page's execution context to intercept window.fetch.
 * Runs in the same world as the Gemini web app, explicitly giving access to network response bodies.
 */

// 1. Intercept Fetch
const originalFetch = window.fetch;
window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const clone = response.clone();

    let url = '';
    if (typeof args[0] === 'string') {
        url = args[0];
    } else if (args[0] instanceof Request) {
        url = args[0].url;
    } else if (args[0] instanceof URL) {
        url = args[0].href;
    }

    if (url.includes('/batched') || url.includes('/chat') || url.includes('gemini') || url.includes('google.com')) {
        try {
            const text = await clone.text();
            extractUsage(text);
        } catch (e) {
            // Stream was locked or failed
        }
    }
    return response;
};

// 2. Intercept XHR
const XHR = XMLHttpRequest;
const xhrOpen = XHR.prototype.open;
const xhrSend = XHR.prototype.send;

(XHR.prototype as any).open = function (this: XMLHttpRequest & { _url?: string | URL }, _method: string, url: string | URL) {
    this._url = url;
    return xhrOpen.apply(this, arguments as any);
};

(XHR.prototype as any).send = function (this: XMLHttpRequest & { _url?: string | URL }) {
    this.addEventListener('load', () => {
        const urlStr = String(this._url);
        if (urlStr.includes('/batched') || urlStr.includes('/chat') || urlStr.includes('gemini') || urlStr.includes('google.com')) {
            try {
                if (this.responseText) {
                    extractUsage(this.responseText);
                }
            } catch (e) { }
        }
    });
    return xhrSend.apply(this, arguments as any);
};

function extractUsage(text: string) {
    // Sometimes the stream sends chunks, match globally and take the last one
    const usageMatches = [...text.matchAll(/"usageMetadata"\s*:\s*({[^}]+})/g)];
    if (usageMatches.length > 0) {
        try {
            // Get the most recent iteration of usage info in the stream
            const lastMatch = usageMatches[usageMatches.length - 1][1];
            const usageMetadata = JSON.parse(lastMatch);

            window.postMessage({
                source: 'gemini-network-interceptor',
                payload: {
                    promptTokenCount: usageMetadata.promptTokenCount || 0,
                    candidatesTokenCount: usageMetadata.candidatesTokenCount || 0,
                    cachedContentTokenCount: usageMetadata.cachedContentTokenCount || 0,
                    totalTokenCount: usageMetadata.totalTokenCount || 0,
                }
            }, '*');
        } catch (e) { }
    }
}

console.log('Gemini Context Tracker: MAIN world fetch/XHR interceptor initialized.');
