import { defineConfig } from 'vite';
import { copyFileSync, cpSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: 'background.ts',
        content: 'content.ts',
        injected: 'injected.ts'
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    },
    minify: false,
    sourcemap: true
  },
  plugins: [
    {
      name: 'copy-static-assets',
      closeBundle() {
        const srcManifest = resolve(__dirname, 'manifest.json');
        const destManifest = resolve(__dirname, 'dist/manifest.json');
        const srcPopup = resolve(__dirname, 'popup.html');
        const destPopup = resolve(__dirname, 'dist/popup.html');
        const srcPopupJs = resolve(__dirname, 'popup.js');
        const destPopupJs = resolve(__dirname, 'dist/popup.js');
        
        if (existsSync(srcManifest)) {
          copyFileSync(srcManifest, destManifest);
          console.log('Copied manifest.json to dist/');
        }
        if (existsSync(srcPopup)) {
          copyFileSync(srcPopup, destPopup);
          console.log('Copied popup.html to dist/');
        }
        if (existsSync(srcPopupJs)) {
          copyFileSync(srcPopupJs, destPopupJs);
          console.log('Copied popup.js to dist/');
        }
        const srcIcons = resolve(__dirname, 'icons');
        const destIcons = resolve(__dirname, 'dist/icons');
        if (existsSync(srcIcons)) {
          mkdirSync(destIcons, { recursive: true });
          cpSync(srcIcons, destIcons, { recursive: true });
          console.log('Copied icons/ to dist/');
        }
        for (const f of ['options.html', 'options.js']) {
          const src = resolve(__dirname, f);
          if (existsSync(src)) {
            copyFileSync(src, resolve(__dirname, 'dist', f));
            console.log(`Copied ${f} to dist/`);
          }
        }
      }
    }
  ]
});