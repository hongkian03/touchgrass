import { allPlatformMatchPatterns } from "../lib/coachInject";
import { startCoachWatch } from "../lib/startCoachWatch";

export default defineContentScript({
  matches: allPlatformMatchPatterns(),
  // Static manifest matches so Chrome injects after onboarding host grant
  // (not empty content_scripts + registerContentScripts alone).
  main() {
    startCoachWatch();
  },
});
