import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {defineConfig} from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    base: '/housefly717.github.io/',
    build: {
      outDir: 'dist',
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'github-pages-root-and-subpath-compat',
        closeBundle() {
          const outDir = path.resolve(rootDir, 'dist');
          const nestedDir = path.join(outDir, 'housefly717.github.io');
          if (!fs.existsSync(outDir)) return;
          const entries = fs.readdirSync(outDir);
          fs.mkdirSync(nestedDir, {recursive: true});
          for (const entry of entries) {
            if (entry === 'housefly717.github.io') continue;
            fs.cpSync(path.join(outDir, entry), path.join(nestedDir, entry), {
              recursive: true,
            });
          }
          fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
        },
      },
    ],
    resolve: {
      alias: {
        '@': rootDir,
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
