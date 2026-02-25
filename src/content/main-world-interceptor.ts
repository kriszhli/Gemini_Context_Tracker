/**
 * MAIN World Script.
 * Overrides the page's execution context to intercept window.fetch.
 * Runs in the same world as the Gemini web app, explicitly giving access to network response bodies.
 */

const originalFetch = window.fetch;

window.fetch = async (...args) => {
    // Fire original request
    const response = await originalFetch(...args);

    // Clone response to parse without consuming the stream the web app needs
    const clone = response.clone();

    // Gemini chat responses often go to a /chat or internal endpoint
    if (args[0] && typeof args[0] === 'string' && args[0].includes('google.com')) {
        try {
            // Note: In reality, Gemini's responses might be streamed or protobuf/gRPC chunks.
            // This is the ideal naive interception, aiming to grab 'usageMetadata' if sent in plain JSON format.
            const text = await clone.text();

            // Attempt to extract usageMetadata from JSON payload
            const usageMatch = text.match(/"usageMetadata"\s*:\s*({[^}]+})/);

            if (usageMatch && usageMatch[1]) {
                const usageMetadata = JSON.parse(usageMatch[1]);

                // Broadcast up to the Isolated World Content Script
                window.postMessage({
                    source: 'gemini-network-interceptor',
                    payload: {
                        promptTokenCount: usageMetadata.promptTokenCount || 0,
                        candidatesTokenCount: usageMetadata.candidatesTokenCount || 0,
                        cachedContentTokenCount: usageMetadata.cachedContentTokenCount || 0,
                        totalTokenCount: usageMetadata.totalTokenCount || 0,
                    }
                }, '*');
            }
        } catch (e) {
            // Fail silently to avoid breaking the core page flow
            console.warn('Context Tracker: failed to intercept response body', e);
        }
    }

    return response;
};

console.log('Gemini Context Tracker: MAIN world fetch interceptor initialized.');
