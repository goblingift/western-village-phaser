import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        /**
         * Phase 90: split the Phaser dependency out of the app bundle.
         *
         * Everything used to land in one ~1.9 MB chunk, which tripped Vite's
         * ">500 kB chunk" warning on every build. Phaser is ~1.5 MB of that
         * and changes only when the dependency is upgraded, whereas the game
         * code changes every commit - separating them means a returning
         * player re-downloads only the small app chunk instead of the whole
         * bundle after each deploy, since the Phaser chunk's content hash
         * (and therefore its cache entry) stays stable.
         *
         * Not code-splitting further: the game is a single scene graph with
         * no route boundaries, so any deeper split would be arbitrary and
         * would just add request round-trips.
         */
        manualChunks(id) {
          if (id.includes('node_modules/phaser')) {
            return 'phaser';
          }
          return undefined;
        },
      },
    },
    // The Phaser vendor chunk is ~1.69 MB minified (~380 kB gzipped) and is
    // irreducible - it's the framework. Raised just above it so the warning
    // stays a real signal about the APP chunk (~237 kB) growing, rather than
    // firing on every single build over a dependency we can't shrink.
    chunkSizeWarningLimit: 1750,
  },
});
