import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // expose on local network for phone testing over WiFi
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
});
