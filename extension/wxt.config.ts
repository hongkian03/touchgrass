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
    commands: {
      "pip-recap": {
        suggested_key: { default: "Alt+Shift+P" },
        description: "Open Touchgrass weekly recap",
      },
    },
  },
  hooks: {
    "build:manifestGenerated": (_wxt, manifest) => {
      // Wipe content-script matches WXT may copy; keep Groq + local backend.
      manifest.host_permissions = [
        "https://api.groq.com/*",
        "http://127.0.0.1:8000/*",
        "http://localhost:8000/*",
      ];
      manifest.optional_host_permissions = OPTIONAL_HOSTS;
    },
  },
});
