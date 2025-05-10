import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { resolve } from "path";
import checker from 'vite-plugin-checker';

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        { src: "manifest.json", dest: "." },
        { src: "manifest-no-csp.json", dest: "." },
        { src: "public/popup.html", dest: "." }, 
        { src: "public/options.html", dest: "." },
      ],
    }),
    checker({ typescript: true }),
  ],

  optimizeDeps: {
    exclude: ['scheduler']
  },

  build: {
    commonjsOptions: {
      exclude: [/node_modules\/scheduler/]
    },
    rollupOptions: {
      input: {
        popup:        resolve(__dirname, "src/popup.tsx"),
        "popup-simple": resolve(__dirname, "src/popup-simple.js"),
        options:      resolve(__dirname, "src/options-vanilla.ts"),
        background:   resolve(__dirname, "src/background.ts"),
        content:      resolve(__dirname, "src/content.ts")
      },
      output: {
        entryFileNames: "[name].js",
      }
    },
    target: 'esnext',
    minify: false,
  },
});