import { getEncoding } from 'js-tiktoken';
import { UsageMetadata } from '../shared/types';

/**
 * Fallback Scraper using js-tiktoken.
 * Used when the MAIN world network interception fails or is too slow.
 * Scrapes the highly nested DOM of Gemini web UI to guess tokens.
 */
export class FallbackScraper {
    private encoder = getEncoding("cl100k_base");

    // Multimodal Heuristics for Gemini
    private readonly IMAGE_TOKEN_COUNT = 258;
    private readonly VIDEO_TOKENS_PER_SEC = 263;

    public estimateTokens(): UsageMetadata {
        let promptTokens = 0;
        let candidatesTokens = 0;

        // 1. Scrape Prompts (User inputs)
        // Gemini typical selector for user queries: \`message-content\` or \`user-query\` (Need robust selectors)
        // We'll use a broad heuristic looking for common ARIA roles or structure since class names might be obfuscated.
        const userQueries = document.querySelectorAll('user-query, [data-test-id="user-query"], .user-query'); // Note: actual classes vary
        userQueries.forEach(query => {
            promptTokens += this.encoder.encode(query.textContent || "").length;
        });

        // 2. Scrape Multimodal in Prompts
        // Images
        const images = document.querySelectorAll('user-query img, [data-test-id="user-query"] img');
        promptTokens += images.length * this.IMAGE_TOKEN_COUNT;

        // Videos - often just a video tag if natively uploaded
        const videos = document.querySelectorAll('user-query video') as NodeListOf<HTMLVideoElement>;
        videos.forEach(video => {
            // Assuming naive 10 second average if duration not loaded yet
            const durationStr = video.duration && !isNaN(video.duration) ? video.duration : 10;
            promptTokens += Math.ceil(durationStr) * this.VIDEO_TOKENS_PER_SEC;
        });

        // 3. Scrape Responses (Model outputs)
        const responses = document.querySelectorAll('message-content, [data-test-id="model-response"], .model-response');
        responses.forEach(response => {
            candidatesTokens += this.encoder.encode(response.textContent || "").length;
        });

        return {
            promptTokenCount: promptTokens,
            candidatesTokenCount: candidatesTokens,
            totalTokenCount: promptTokens + candidatesTokens
        };
    }

    public getTokensForText(text: string): number {
        return this.encoder.encode(text).length;
    }
}
