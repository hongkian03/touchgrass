(() => {
  const store = {
    onboarded: !location.pathname.endsWith("/onboarding.html"),
    enabledPlatforms: ["chatgpt"],
    usage: [
      {
        id: "1",
        ts: Date.now(),
        platform: "chatgpt",
        model: "gpt-4o-mini",
        prompt_text: "what is 2+2",
        kind: "text",
        regenerated: false,
      },
      {
        id: "2",
        ts: Date.now() - 1000,
        platform: "chatgpt",
        model: "gpt-5",
        prompt_text: "draw a cat",
        kind: "image",
        regenerated: false,
      },
      {
        id: "3",
        ts: Date.now() - 2000,
        platform: "chatgpt",
        model: "gpt-5",
        prompt_text: "hello",
        kind: "text",
        regenerated: true,
      },
      {
        id: "4",
        ts: Date.now() - 3000,
        platform: "chatgpt",
        model: "gpt-5",
        prompt_text: "weather in Boston",
        kind: "text",
        regenerated: false,
      },
    ],
    score: 85,
    streak: 3,
    lastCoachAt: 0,
  };
  window.__openedTabs = [];
  const api = {
    storage: {
      local: {
        get: async () => ({ ...store }),
        set: async (patch) => {
          Object.assign(store, patch);
        },
      },
    },
    runtime: {
      id: "puddle-verify7",
      getURL: (p) => new URL(p, location.origin).href,
      sendMessage: async () => ({ isAi: false }),
      onMessage: { addListener() {}, removeListener() {} },
    },
    tabs: {
      create: async (opts) => {
        window.__openedTabs.push(opts);
        return { id: 1 };
      },
    },
    permissions: {
      request: async () => true,
    },
  };
  window.chrome = api;
  window.browser = api;
})();
