import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        { src: "manifest.json", dest: "." }, // Copy manifest.json to the root of dist
        // { src: "icons", dest: "icons" },    // Copy the icons folder to dist/icons
      ],
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        popup: "public/popup.html",
        options: "public/options.html",
      },
      output: {
        entryFileNames: "[name].js", // Ensures output files match input names
      },
    },
  },
});