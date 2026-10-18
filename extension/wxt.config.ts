import { defineConfig } from "wxt";
import platforms from "./data/platforms.json";

/** Origins user may grant at onboarding (not active until permissions.request). */
const OPTIONAL_HOSTS = [
  ...new Set(
    (platforms as Array<{ hosts: string[] }>).flatMap((p) => p.hosts),
  ),
  "https://chat.mistral.ai/*",
  "https://gemini.google.com/app*",
  "https://gemini.google.com/*",
];

export default defineConfig({
  modules: ["@wxt-dev/module-react", "@wxt-dev/auto-icons"],
  // Regenerates every toolbar icon size from the repo-root logo on each build.
  autoIcons: { baseIconPath: "../logo.png" },
  manifest: {
    name: "Touchgrass",
    description: "Track AI usage. Coach before you waste a prompt.",
    // activeTab: inject the floating panel into the tab whose toolbar icon was clicked
    permissions: ["storage", "tabs", "scripting", "alarms", "activeTab"],
    // Active at install: Groq + local PromptPrint API. AI sites opted in at onboarding.
    host_permissions: [
      "https://api.groq.com/*",
      "http://127.0.0.1:8000/*",
      "http://localhost:8000/*",
    ],
    optional_host_permissions: OPTIONAL_HOSTS,
    // Toast on Claude/etc. loads gemini.svg via chrome-extension:// URL
    web_accessible_resources: [
      {
        resources: ["icons/*", "fonts/*"],
        matches: ["<all_urls>"],
      },
    ],
    commands: {
      "pip-recap": {
        suggested_key: { default: "Alt+Shift+P" },
        description: "Open Touchgrass weekly recap",
      },
    },
  },
  hooks: {
    "build:manifestGenerated": (_wxt, manifest) => {
      // Keep Groq + local backend as required hosts; AI sites stay optional.
      // Do NOT wipe content_scripts — static matches inject after onboarding grant.
      manifest.host_permissions = [
        "https://api.groq.com/*",
        "http://127.0.0.1:8000/*",
        "http://localhost:8000/*",
      ];
      manifest.optional_host_permissions = OPTIONAL_HOSTS;
      manifest.web_accessible_resources = [
        {
          // popup.html is framed by the floating panel on web pages
          resources: ["icons/*", "fonts/*", "popup.html"],
          matches: ["<all_urls>"],
        },
      ];
      // Toolbar click opens the floating panel (action.onClicked), so no default
      // popup; background falls back to the popup on Chrome-protected pages.
      if (manifest.action) delete manifest.action.default_popup;
      if (!manifest.content_scripts?.length) {
        const matches = [
          ...new Set(
            (platforms as Array<{ hosts: string[] }>).flatMap((p) => p.hosts),
          ),
        ];
        if (matches.length) {
          manifest.content_scripts = [
            {
              matches,
              js: ["content-scripts/content.js"],
              run_at: "document_idle",
            },
          ];
        }
      }
    },
  },
});
