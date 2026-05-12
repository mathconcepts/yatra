/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// For GitHub Pages: set VITE_BASE=/yatra/ when deploying via Actions.
// Locally and on Vercel/Netlify, leave it unset.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || "/",
  server: { port: 5173, open: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.js"],
    include: ["test/**/*.{test,spec}.{js,jsx,ts,tsx}"],
  },
});
