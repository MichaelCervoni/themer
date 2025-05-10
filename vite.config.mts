import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { resolve } from "path";
import checker from 'vite-plugin-checker';

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        { src: "manifest.json", dest: "." },
        { src: "public/*.html", dest: "." },
      ],
    }),
    checker({ typescript: true }),
  ],

  // Don’t pre-bundle or optimize scheduler’s TS files
  optimizeDeps: {
    exclude: ['scheduler']
  },

  build: {
    // Prevent Vite’s CommonJS plugin from trying to compile scheduler’s .ts
    commonjsOptions: {
      exclude: [/node_modules\/scheduler/]
    },    rollupOptions: {
      input: {
        popup:     resolve(__dirname, "src/popup.tsx"),
        options:   resolve(__dirname, "src/options.tsx"),
        background:resolve(__dirname, "src/background.ts"),
        content:   resolve(__dirname, "src/content.ts")
      },
      output: {
        entryFileNames: "[name].js",
      }
    },

    target: 'esnext',
    minify: false,
  },
});
