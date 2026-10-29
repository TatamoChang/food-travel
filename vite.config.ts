import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths so the build works under any GitHub Pages sub-path.
  base: "./",
  server: { port: 5173, strictPort: true },
  build: { sourcemap: true },
});
