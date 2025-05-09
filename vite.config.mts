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
        // { src: "icons", dest: "." }, // Enable if you have icons
      ],
    }),
    checker({ typescript: true }),
  ],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup.tsx"),
        options: resolve(__dirname, "src/options.tsx"),
        background: resolve(__dirname, "src/background.ts"),
        content: resolve(__dirname, "src/content.ts")
      },
      output: {
        entryFileNames: "[name].js",
      }
    },
    target: 'esnext',
    minify: false,
  },
});