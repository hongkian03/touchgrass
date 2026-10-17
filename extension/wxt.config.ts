import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Puddle",
    description: "Track AI usage. Coach before you waste a prompt.",
    permissions: ["storage", "tabs", "scripting"],
    // Site hosts stay empty until onboarding. Groq = AI-site check.
    host_permissions: ["https://api.groq.com/*"],
    commands: {
      "pip-recap": {
        suggested_key: { default: "Alt+Shift+P" },
        description: "Open Puddle weekly recap",
      },
    },
  },
  hooks: {
    "build:manifestGenerated": (_wxt, manifest) => {
      // Wipe content-script matches WXT may copy; keep Groq API host only.
      manifest.host_permissions = ["https://api.groq.com/*"];
    },
  },
});
