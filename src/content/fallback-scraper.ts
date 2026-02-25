import { UsageMetadata } from '../shared/types';
import type { Tiktoken } from 'js-tiktoken';

/**
 * Fallback Scraper using js-tiktoken.
 * Used when the MAIN world network interception fails or is too slow.
 * Scrapes the highly nested DOM of Gemini web UI to guess tokens.
 */
export class FallbackScraper {
    private encoderPromise: Promise<Tiktoken> | null = null;

    // Multimodal Heuristics for Gemini
    private readonly IMAGE_TOKEN_COUNT = 258;
    private readonly VIDEO_TOKENS_PER_SEC = 263;

    private async getEncoder(): Promise<Tiktoken> {
        if (!this.encoderPromise) {
            this.encoderPromise = import('js-tiktoken').then(({ getEncoding }) => getEncoding("cl100k_base"));
        }
        return this.encoderPromise;
    }

    public async estimateTokens(): Promise<UsageMetadata> {
        const encoder = await this.getEncoder();
        let promptTokens = 0;
        let candidatesTokens = 0;

        // 1. Scrape Prompts (User inputs)
        const userQueries = document.querySelectorAll('user-query, [data-test-id="user-query"], .user-query, [class*="user-query"], [class*="user-message"], .query-text, message-content[sender="user"]');

        // 3. Scrape Responses (Model outputs)
        const responses = document.querySelectorAll('message-content, [data-test-id="model-response"], .model-response, [class*="model-response"], [class*="model-message"], .response-text, message-content[sender="model"]');

        if (userQueries.length === 0 && responses.length === 0) {
            // Aggressive fallback if specific elements are obscured by minified classes
            const chatContainer = document.querySelector('chat-app, infinite-scroller, #chat-history, main, [role="main"]');
            if (chatContainer) {
                // If we can't separate prompt from candidates, we stick it all in promptTokens for total count
                promptTokens += encoder.encode(chatContainer.textContent || "").length;
            } else {
                promptTokens += encoder.encode(document.body.innerText || "").length;
            }
        } else {
            userQueries.forEach(query => {
                promptTokens += encoder.encode(query.textContent || "").length;
            });

            // 2. Scrape Multimodal in Prompts
            const images = document.querySelectorAll('img'); // broader match just in case
            promptTokens += images.length * this.IMAGE_TOKEN_COUNT;

            const videos = document.querySelectorAll('video') as NodeListOf<HTMLVideoElement>;
            videos.forEach(video => {
                const durationStr = video.duration && !isNaN(video.duration) ? video.duration : 10;
                promptTokens += Math.ceil(durationStr) * this.VIDEO_TOKENS_PER_SEC;
            });

            responses.forEach(response => {
                candidatesTokens += encoder.encode(response.textContent || "").length;
            });
        }

        return {
            promptTokenCount: promptTokens,
            candidatesTokenCount: candidatesTokens,
            totalTokenCount: promptTokens + candidatesTokens
        };
    }

    public async getTokensForText(text: string): Promise<number> {
        const encoder = await this.getEncoder();
        return encoder.encode(text).length;
    }
}
