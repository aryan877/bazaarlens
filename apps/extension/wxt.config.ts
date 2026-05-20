import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

const EXTENSION_ICONS = {
  "16": "icons/icon-16.png",
  "32": "icons/icon-32.png",
  "48": "icons/icon-48.png",
  "128": "icons/icon-128.png",
};

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: "BazaarLens",
    description: "Indian ecommerce copilot for safer product decisions.",
    icons: EXTENSION_ICONS,
    permissions: ["activeTab", "storage", "sidePanel"],
    host_permissions: buildHostPermissions(process.env.WXT_API_URL ?? "http://localhost:8787"),
    action: {
      default_title: "BazaarLens",
      default_icon: EXTENSION_ICONS,
    },
    side_panel: {
      default_path: "sidepanel/index.html",
    },
  },
  zip: {
    artifactTemplate: "bazaarlens-{{version}}-{{browser}}.zip",
  },
});

function buildHostPermissions(apiUrl: string): string[] {
  return [
    "https://www.amazon.in/*",
    "https://amazon.in/*",
    "https://www.flipkart.com/*",
    "https://www.myntra.com/*",
    `${new URL(apiUrl).origin}/*`,
  ];
}
