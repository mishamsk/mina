import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const backendURL =
  process.env.MINA_FRONTEND_BACKEND_URL ?? "http://127.0.0.1:8080";
const embeddedOutDir = fileURLToPath(
  new URL("../internal/webui/dist", import.meta.url),
);
const embeddedPlaceholderPath = fileURLToPath(
  new URL("../internal/webui/dist/README.md", import.meta.url),
);
const embeddedPlaceholder = `Tracked placeholder for Go embed.

The real web UI build writes ignored assets here, including \`index.html\`.
`;

export default defineConfig({
  base: "/",
  build: {
    emptyOutDir: true,
    outDir: "../internal/webui/dist",
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "preserve-webui-embed-placeholder",
      closeBundle() {
        mkdirSync(embeddedOutDir, { recursive: true });
        writeFileSync(embeddedPlaceholderPath, embeddedPlaceholder);
      },
    },
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/api": backendURL,
    },
  },
});
