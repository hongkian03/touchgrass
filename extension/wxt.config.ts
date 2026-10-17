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
    name: "Puddle",
    description: "Track AI usage. Coach before you waste a prompt.",
    permissions: ["storage", "tabs", "scripting"],
    // Active at install: Groq only. Site access opted in during onboarding.
    host_permissions: ["https://api.groq.com/*"],
    optional_host_permissions: OPTIONAL_HOSTS,
    commands: {
      "pip-recap": {
        suggested_key: { default: "Alt+Shift+P" },
        description: "Open Puddle weekly recap",
      },
    },
  },
  hooks: {
    "build:manifestGenerated": (_wxt, manifest) => {
      // Wipe content-script matches WXT may copy; keep Groq active host only.
      manifest.host_permissions = ["https://api.groq.com/*"];
      manifest.optional_host_permissions = OPTIONAL_HOSTS;
    },
  },
});
