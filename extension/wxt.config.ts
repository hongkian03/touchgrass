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
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Touchgrass",
    description: "Track AI usage. Coach before you waste a prompt.",
    permissions: ["storage", "tabs", "scripting", "alarms"],
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
        resources: ["icons/*"],
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
          resources: ["icons/*"],
          matches: ["<all_urls>"],
        },
      ];
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
