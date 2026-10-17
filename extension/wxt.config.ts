import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Puddle",
    description: "Track AI usage. Coach before you waste a prompt.",
    permissions: ["storage", "tabs", "scripting"],
    // Opt-in hosts only after onboarding (issue #4). Keep empty at install.
    host_permissions: [],
  },
  hooks: {
    "build:manifestGenerated": (_wxt, manifest) => {
      // WXT copies content-script matches into host_permissions; wipe for #2/#4 gate.
      manifest.host_permissions = [];
    },
  },
});
