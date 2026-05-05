import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { enefitApiPlugin } from "./src/server/api";

export default defineConfig({
  plugins: [react(), enefitApiPlugin()],
});
