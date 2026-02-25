import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
// Note: We need to import manifest.json dynamically or assert its type as any to avoid strict TS errors on manifest loading if not using a specific manifest config wrapper.
// An alternative is using defineManifest from @crxjs/vite-plugin but since we already have a static manifest, we'll try to just read it.
import manifest from './manifest.json' with { type: 'json' };

export default defineConfig({
    plugins: [
        // Ignore typings for the imported manifest as crx plugin expects a specific subset of types that sometimes clash with raw JSON.
        crx({ manifest: manifest as any }),
    ],
    build: {
        chunkSizeWarningLimit: 6000,
    }
});
