(() => {
  const params = new URLSearchParams(location.search);
  const enabled =
    params.get("enabled")?.split(",").filter(Boolean) ??
    ["chatgpt", "gemini"];
  const store = {
    onboarded: !location.pathname.endsWith("/onboarding.html"),
    enabledPlatforms: enabled,
    usage: [
  {
    "ts": "2026-10-17T14:00:00Z",
    "provider": "dalle",
    "model": "dall-e-3",
    "kind": "image",
    "prompt_text": "a watercolor fox in a puddle",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-17T11:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-4o-mini",
    "kind": "text",
    "prompt_text": "who's the mayor of Boston",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-17T08:00:00Z",
    "provider": "claude",
    "model": "claude-opus",
    "kind": "text",
    "prompt_text": "weather in Tokyo",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-17T05:00:00Z",
    "provider": "claude",
    "model": "claude-haiku",
    "kind": "text",
    "prompt_text": "Write a CUDA kernel for fused attention with flash-attention v3 constraints",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-17T02:00:00Z",
    "provider": "gemini",
    "model": "gemini-pro",
    "kind": "text",
    "prompt_text": "translate hello to French",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-16T23:00:00Z",
    "provider": "gemini",
    "model": "gemini-flash",
    "kind": "text",
    "prompt_text": "summarize this paragraph briefly",
    "response_text": "ok",
    "regenerated": true
  },
  {
    "ts": "2026-10-16T20:00:00Z",
    "provider": "grok",
    "model": "grok-3",
    "kind": "text",
    "prompt_text": "Prove the amortized complexity of this splay tree rotation sequence",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-16T17:00:00Z",
    "provider": "perplexity",
    "model": "sonar-pro",
    "kind": "text",
    "prompt_text": "who's the mayor of Boston",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-16T14:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-5",
    "kind": "text",
    "prompt_text": "weather in Tokyo",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-16T11:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-4o-mini",
    "kind": "text",
    "prompt_text": "Design a distributed consensus protocol for multi-region KV stores",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-16T08:00:00Z",
    "provider": "claude",
    "model": "claude-opus",
    "kind": "text",
    "prompt_text": "translate hello to French",
    "response_text": "ok",
    "regenerated": true
  },
  {
    "ts": "2026-10-16T05:00:00Z",
    "provider": "dalle",
    "model": "dall-e-3",
    "kind": "image",
    "prompt_text": "a watercolor fox in a puddle",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-16T02:00:00Z",
    "provider": "gemini",
    "model": "gemini-pro",
    "kind": "text",
    "prompt_text": "Refactor this React concurrent rendering pipeline for suspense boundaries",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-15T23:00:00Z",
    "provider": "gemini",
    "model": "gemini-flash",
    "kind": "text",
    "prompt_text": "who's the mayor of Boston",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-15T20:00:00Z",
    "provider": "grok",
    "model": "grok-3",
    "kind": "text",
    "prompt_text": "weather in Tokyo",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-15T17:00:00Z",
    "provider": "perplexity",
    "model": "sonar-pro",
    "kind": "text",
    "prompt_text": "define entropy",
    "response_text": "ok",
    "regenerated": true
  },
  {
    "ts": "2026-10-15T14:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-5",
    "kind": "text",
    "prompt_text": "translate hello to French",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-15T11:00:00Z",
    "provider": "chatgpt",
    "model": "video-gen",
    "kind": "video",
    "prompt_text": "cinematic drone shot of a harbor",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-15T08:00:00Z",
    "provider": "claude",
    "model": "claude-opus",
    "kind": "text",
    "prompt_text": "Prove the amortized complexity of this splay tree rotation sequence",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-15T05:00:00Z",
    "provider": "claude",
    "model": "claude-haiku",
    "kind": "text",
    "prompt_text": "who's the mayor of Boston",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-15T02:00:00Z",
    "provider": "gemini",
    "model": "gemini-pro",
    "kind": "text",
    "prompt_text": "weather in Tokyo",
    "response_text": "ok",
    "regenerated": true
  },
  {
    "ts": "2026-10-14T23:00:00Z",
    "provider": "gemini",
    "model": "gemini-flash",
    "kind": "text",
    "prompt_text": "Design a distributed consensus protocol for multi-region KV stores",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-14T20:00:00Z",
    "provider": "dalle",
    "model": "dall-e-3",
    "kind": "image",
    "prompt_text": "a watercolor fox in a puddle",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-14T17:00:00Z",
    "provider": "perplexity",
    "model": "sonar-pro",
    "kind": "text",
    "prompt_text": "summarize this paragraph briefly",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-14T14:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-5",
    "kind": "text",
    "prompt_text": "Refactor this React concurrent rendering pipeline for suspense boundaries",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-14T11:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-4o-mini",
    "kind": "text",
    "prompt_text": "who's the mayor of Boston",
    "response_text": "ok",
    "regenerated": true
  },
  {
    "ts": "2026-10-14T08:00:00Z",
    "provider": "claude",
    "model": "claude-opus",
    "kind": "text",
    "prompt_text": "weather in Tokyo",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-14T05:00:00Z",
    "provider": "claude",
    "model": "claude-haiku",
    "kind": "text",
    "prompt_text": "Write a CUDA kernel for fused attention with flash-attention v3 constraints",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-14T02:00:00Z",
    "provider": "gemini",
    "model": "gemini-pro",
    "kind": "text",
    "prompt_text": "translate hello to French",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-13T23:00:00Z",
    "provider": "gemini",
    "model": "gemini-flash",
    "kind": "text",
    "prompt_text": "summarize this paragraph briefly",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-13T20:00:00Z",
    "provider": "grok",
    "model": "grok-3",
    "kind": "text",
    "prompt_text": "what is photosynthesis",
    "response_text": "ok",
    "regenerated": true
  },
  {
    "ts": "2026-10-13T17:00:00Z",
    "provider": "perplexity",
    "model": "sonar-pro",
    "kind": "text",
    "prompt_text": "who's the mayor of Boston",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-13T14:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-5",
    "kind": "text",
    "prompt_text": "weather in Tokyo",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-13T11:00:00Z",
    "provider": "dalle",
    "model": "dall-e-3",
    "kind": "image",
    "prompt_text": "a watercolor fox in a puddle",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-13T08:00:00Z",
    "provider": "chatgpt",
    "model": "video-gen",
    "kind": "video",
    "prompt_text": "cinematic drone shot of a harbor",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-13T05:00:00Z",
    "provider": "claude",
    "model": "claude-haiku",
    "kind": "text",
    "prompt_text": "summarize this paragraph briefly",
    "response_text": "ok",
    "regenerated": true
  },
  {
    "ts": "2026-10-13T02:00:00Z",
    "provider": "gemini",
    "model": "gemini-pro",
    "kind": "text",
    "prompt_text": "Refactor this React concurrent rendering pipeline for suspense boundaries",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-12T23:00:00Z",
    "provider": "gemini",
    "model": "gemini-flash",
    "kind": "text",
    "prompt_text": "who's the mayor of Boston",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-12T20:00:00Z",
    "provider": "grok",
    "model": "grok-3",
    "kind": "text",
    "prompt_text": "weather in Tokyo",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-12T17:00:00Z",
    "provider": "perplexity",
    "model": "sonar-pro",
    "kind": "text",
    "prompt_text": "Write a CUDA kernel for fused attention with flash-attention v3 constraints",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-11T14:00:00Z",
    "provider": "perplexity",
    "model": "sonar-pro",
    "kind": "text",
    "prompt_text": "Design a distributed consensus protocol for multi-region KV stores",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-11T11:00:00Z",
    "provider": "gemini",
    "model": "gemini-pro",
    "kind": "text",
    "prompt_text": "who's the mayor of Boston",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-11T08:00:00Z",
    "provider": "claude",
    "model": "claude-opus",
    "kind": "text",
    "prompt_text": "Prove the amortized complexity of this splay tree rotation sequence",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-10T14:00:00Z",
    "provider": "claude",
    "model": "claude-haiku",
    "kind": "text",
    "prompt_text": "who's the mayor of Boston",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-10T11:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-4o-mini",
    "kind": "text",
    "prompt_text": "Prove the amortized complexity of this splay tree rotation sequence",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-10T08:00:00Z",
    "provider": "grok",
    "model": "grok-3",
    "kind": "text",
    "prompt_text": "what is photosynthesis",
    "response_text": "ok",
    "regenerated": true
  },
  {
    "ts": "2026-10-09T14:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-5",
    "kind": "text",
    "prompt_text": "Prove the amortized complexity of this splay tree rotation sequence",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-09T11:00:00Z",
    "provider": "perplexity",
    "model": "sonar-pro",
    "kind": "text",
    "prompt_text": "what is photosynthesis",
    "response_text": "ok",
    "regenerated": true
  },
  {
    "ts": "2026-10-09T08:00:00Z",
    "provider": "dalle",
    "model": "dall-e-3",
    "kind": "image",
    "prompt_text": "a watercolor fox in a puddle",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-08T14:00:00Z",
    "provider": "chatgpt",
    "model": "video-gen",
    "kind": "video",
    "prompt_text": "cinematic drone shot of a harbor",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-08T11:00:00Z",
    "provider": "claude",
    "model": "claude-haiku",
    "kind": "text",
    "prompt_text": "Design a distributed consensus protocol for multi-region KV stores",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-08T08:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-4o-mini",
    "kind": "text",
    "prompt_text": "translate hello to French",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-07T14:00:00Z",
    "provider": "claude",
    "model": "claude-opus",
    "kind": "text",
    "prompt_text": "Design a distributed consensus protocol for multi-region KV stores",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-07T11:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-4o-mini",
    "kind": "text",
    "prompt_text": "translate hello to French",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-07T08:00:00Z",
    "provider": "perplexity",
    "model": "sonar-pro",
    "kind": "text",
    "prompt_text": "Prove the amortized complexity of this splay tree rotation sequence",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-06T14:00:00Z",
    "provider": "grok",
    "model": "grok-3",
    "kind": "text",
    "prompt_text": "translate hello to French",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-06T11:00:00Z",
    "provider": "gemini",
    "model": "gemini-flash",
    "kind": "text",
    "prompt_text": "Prove the amortized complexity of this splay tree rotation sequence",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-06T08:00:00Z",
    "provider": "dalle",
    "model": "dall-e-3",
    "kind": "image",
    "prompt_text": "a watercolor fox in a puddle",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-05T17:00:00Z",
    "provider": "gemini",
    "model": "gemini-flash",
    "kind": "text",
    "prompt_text": "translate hello to French",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-05T14:00:00Z",
    "provider": "claude",
    "model": "claude-haiku",
    "kind": "text",
    "prompt_text": "Prove the amortized complexity of this splay tree rotation sequence",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-05T11:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-4o-mini",
    "kind": "text",
    "prompt_text": "who's the mayor of Boston",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-05T08:00:00Z",
    "provider": "grok",
    "model": "grok-3",
    "kind": "text",
    "prompt_text": "Design a distributed consensus protocol for multi-region KV stores",
    "response_text": "ok",
    "regenerated": true
  },
  {
    "ts": "2026-10-04T17:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-4o-mini",
    "kind": "text",
    "prompt_text": "Prove the amortized complexity of this splay tree rotation sequence",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-04T14:00:00Z",
    "provider": "chatgpt",
    "model": "video-gen",
    "kind": "video",
    "prompt_text": "cinematic drone shot of a harbor",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-04T11:00:00Z",
    "provider": "gemini",
    "model": "gemini-flash",
    "kind": "text",
    "prompt_text": "Design a distributed consensus protocol for multi-region KV stores",
    "response_text": "ok",
    "regenerated": true
  },
  {
    "ts": "2026-10-04T08:00:00Z",
    "provider": "claude",
    "model": "claude-haiku",
    "kind": "text",
    "prompt_text": "what is photosynthesis",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-03T17:00:00Z",
    "provider": "gemini",
    "model": "gemini-flash",
    "kind": "text",
    "prompt_text": "who's the mayor of Boston",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-03T14:00:00Z",
    "provider": "claude",
    "model": "claude-haiku",
    "kind": "text",
    "prompt_text": "Design a distributed consensus protocol for multi-region KV stores",
    "response_text": "ok",
    "regenerated": true
  },
  {
    "ts": "2026-10-03T11:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-4o-mini",
    "kind": "text",
    "prompt_text": "what is photosynthesis",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-03T08:00:00Z",
    "provider": "dalle",
    "model": "dall-e-3",
    "kind": "image",
    "prompt_text": "a watercolor fox in a puddle",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-02T17:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-4o-mini",
    "kind": "text",
    "prompt_text": "Design a distributed consensus protocol for multi-region KV stores",
    "response_text": "ok",
    "regenerated": true
  },
  {
    "ts": "2026-10-02T14:00:00Z",
    "provider": "grok",
    "model": "grok-3",
    "kind": "text",
    "prompt_text": "what is photosynthesis",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-02T11:00:00Z",
    "provider": "gemini",
    "model": "gemini-flash",
    "kind": "text",
    "prompt_text": "Prove the amortized complexity of this splay tree rotation sequence",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-02T08:00:00Z",
    "provider": "claude",
    "model": "claude-haiku",
    "kind": "text",
    "prompt_text": "translate hello to French",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-01T17:00:00Z",
    "provider": "gemini",
    "model": "gemini-flash",
    "kind": "text",
    "prompt_text": "what is photosynthesis",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-01T14:00:00Z",
    "provider": "claude",
    "model": "claude-haiku",
    "kind": "text",
    "prompt_text": "Prove the amortized complexity of this splay tree rotation sequence",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-01T11:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-4o-mini",
    "kind": "text",
    "prompt_text": "translate hello to French",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-10-01T08:00:00Z",
    "provider": "grok",
    "model": "grok-3",
    "kind": "text",
    "prompt_text": "Design a distributed consensus protocol for multi-region KV stores",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-30T16:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-4o-mini",
    "kind": "text",
    "prompt_text": "translate hello to French",
    "response_text": "ok",
    "regenerated": true
  },
  {
    "ts": "2026-09-30T13:00:00Z",
    "provider": "perplexity",
    "model": "sonar-pro",
    "kind": "text",
    "prompt_text": "weather in Tokyo",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-30T10:00:00Z",
    "provider": "dalle",
    "model": "dall-e-3",
    "kind": "image",
    "prompt_text": "a watercolor fox in a puddle",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-29T16:00:00Z",
    "provider": "gemini",
    "model": "gemini-flash",
    "kind": "text",
    "prompt_text": "weather in Tokyo",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-29T13:00:00Z",
    "provider": "claude",
    "model": "claude-haiku",
    "kind": "text",
    "prompt_text": "Refactor this React concurrent rendering pipeline for suspense boundaries",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-29T10:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-4o-mini",
    "kind": "text",
    "prompt_text": "define entropy",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-28T16:00:00Z",
    "provider": "claude",
    "model": "claude-opus",
    "kind": "text",
    "prompt_text": "Refactor this React concurrent rendering pipeline for suspense boundaries",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-28T13:00:00Z",
    "provider": "chatgpt",
    "model": "video-gen",
    "kind": "video",
    "prompt_text": "cinematic drone shot of a harbor",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-28T10:00:00Z",
    "provider": "perplexity",
    "model": "sonar-pro",
    "kind": "text",
    "prompt_text": "what is photosynthesis",
    "response_text": "ok",
    "regenerated": true
  },
  {
    "ts": "2026-09-27T16:00:00Z",
    "provider": "grok",
    "model": "grok-3",
    "kind": "text",
    "prompt_text": "define entropy",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-27T13:00:00Z",
    "provider": "gemini",
    "model": "gemini-flash",
    "kind": "text",
    "prompt_text": "what is photosynthesis",
    "response_text": "ok",
    "regenerated": true
  },
  {
    "ts": "2026-09-27T10:00:00Z",
    "provider": "claude",
    "model": "claude-haiku",
    "kind": "text",
    "prompt_text": "Prove the amortized complexity of this splay tree rotation sequence",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-26T16:00:00Z",
    "provider": "gemini",
    "model": "gemini-pro",
    "kind": "text",
    "prompt_text": "what is photosynthesis",
    "response_text": "ok",
    "regenerated": true
  },
  {
    "ts": "2026-09-26T13:00:00Z",
    "provider": "claude",
    "model": "claude-opus",
    "kind": "text",
    "prompt_text": "Prove the amortized complexity of this splay tree rotation sequence",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-26T10:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-4o-mini",
    "kind": "text",
    "prompt_text": "translate hello to French",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-25T16:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-4o-mini",
    "kind": "text",
    "prompt_text": "Prove the amortized complexity of this splay tree rotation sequence",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-25T13:00:00Z",
    "provider": "grok",
    "model": "grok-3",
    "kind": "text",
    "prompt_text": "translate hello to French",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-25T10:00:00Z",
    "provider": "dalle",
    "model": "dall-e-3",
    "kind": "image",
    "prompt_text": "a watercolor fox in a puddle",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-24T16:00:00Z",
    "provider": "perplexity",
    "model": "sonar-pro",
    "kind": "text",
    "prompt_text": "translate hello to French",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-24T13:00:00Z",
    "provider": "gemini",
    "model": "gemini-pro",
    "kind": "text",
    "prompt_text": "weather in Tokyo",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-24T10:00:00Z",
    "provider": "claude",
    "model": "claude-opus",
    "kind": "text",
    "prompt_text": "Write a CUDA kernel for fused attention with flash-attention v3 constraints",
    "response_text": "ok",
    "regenerated": true
  },
  {
    "ts": "2026-09-23T16:00:00Z",
    "provider": "claude",
    "model": "claude-haiku",
    "kind": "text",
    "prompt_text": "weather in Tokyo",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-23T13:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-4o-mini",
    "kind": "text",
    "prompt_text": "Write a CUDA kernel for fused attention with flash-attention v3 constraints",
    "response_text": "ok",
    "regenerated": true
  },
  {
    "ts": "2026-09-23T10:00:00Z",
    "provider": "grok",
    "model": "grok-3",
    "kind": "text",
    "prompt_text": "define entropy",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-22T16:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-5",
    "kind": "text",
    "prompt_text": "Write a CUDA kernel for fused attention with flash-attention v3 constraints",
    "response_text": "ok",
    "regenerated": true
  },
  {
    "ts": "2026-09-22T13:00:00Z",
    "provider": "perplexity",
    "model": "sonar-pro",
    "kind": "text",
    "prompt_text": "define entropy",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-22T10:00:00Z",
    "provider": "gemini",
    "model": "gemini-pro",
    "kind": "text",
    "prompt_text": "what is photosynthesis",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-21T16:00:00Z",
    "provider": "gemini",
    "model": "gemini-flash",
    "kind": "text",
    "prompt_text": "define entropy",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-21T13:00:00Z",
    "provider": "chatgpt",
    "model": "video-gen",
    "kind": "video",
    "prompt_text": "cinematic drone shot of a harbor",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-21T10:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-4o-mini",
    "kind": "text",
    "prompt_text": "Design a distributed consensus protocol for multi-region KV stores",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-20T16:00:00Z",
    "provider": "claude",
    "model": "claude-opus",
    "kind": "text",
    "prompt_text": "what is photosynthesis",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-20T13:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-5",
    "kind": "text",
    "prompt_text": "Design a distributed consensus protocol for multi-region KV stores",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-20T10:00:00Z",
    "provider": "dalle",
    "model": "dall-e-3",
    "kind": "image",
    "prompt_text": "a watercolor fox in a puddle",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-19T16:00:00Z",
    "provider": "grok",
    "model": "grok-3",
    "kind": "text",
    "prompt_text": "Design a distributed consensus protocol for multi-region KV stores",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-19T13:00:00Z",
    "provider": "gemini",
    "model": "gemini-flash",
    "kind": "text",
    "prompt_text": "translate hello to French",
    "response_text": "ok",
    "regenerated": true
  },
  {
    "ts": "2026-09-19T10:00:00Z",
    "provider": "claude",
    "model": "claude-haiku",
    "kind": "text",
    "prompt_text": "weather in Tokyo",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-18T16:00:00Z",
    "provider": "gemini",
    "model": "gemini-pro",
    "kind": "text",
    "prompt_text": "translate hello to French",
    "response_text": "ok",
    "regenerated": true
  },
  {
    "ts": "2026-09-18T13:00:00Z",
    "provider": "claude",
    "model": "claude-opus",
    "kind": "text",
    "prompt_text": "weather in Tokyo",
    "response_text": "ok",
    "regenerated": false
  },
  {
    "ts": "2026-09-18T10:00:00Z",
    "provider": "chatgpt",
    "model": "gpt-5",
    "kind": "text",
    "prompt_text": "Refactor this React concurrent rendering pipeline for suspense boundaries",
    "response_text": "ok",
    "regenerated": false
  }
],
    score: 85,
    streak: 3,
    lastCoachAt: 0,
  };
  window.__openedTabs = [];
  window.__pastedDrafts = [];
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
      sendMessage: async (message) => {
        if (message?.type === "puddle/coach-open-paste") {
          const url = String(message.url ?? "");
          const draft = String(message.draft ?? "");
          if (/deepseek/i.test(url)) return { ok: false, error: "bad route" };
          window.__openedTabs.push({ url, draft });
          window.__pastedDrafts.push(draft);
          return { ok: true };
        }
        if (message?.type === "puddle/route-query") {
          const draft = String(message.draft ?? "");
          const provider = String(
            message.provider ?? params.get("provider") ?? "chatgpt",
          );
          const enabledList = Array.isArray(message.enabledPlatforms)
            ? message.enabledPlatforms.filter(Boolean)
            : enabled;
          // Stay on current when ?routeStay=1 (no hop)
          if (params.get("routeStay") === "1") {
            return {
              ok: true,
              platformId: provider,
              reason: "already on best",
            };
          }
          if (/weather|news|research|what's happening|whats happening/i.test(draft)) {
            let hop = null;
            for (const id of ["perplexity", "gemini"]) {
              if (enabledList.includes(id) && id !== provider) {
                hop = id;
                break;
              }
            }
            if (!hop) {
              hop =
                enabledList.find((id) => id !== provider && !/deepseek/i.test(id)) ??
                provider;
            }
            return { ok: true, platformId: hop, reason: "weather" };
          }
          return { ok: true, platformId: provider, reason: "stay" };
        }
        if (message?.type === "puddle/classify-ai-site") {
          const provider = params.get("provider");
          if (provider) {
            return { isAi: true, label: provider };
          }
          return { isAi: false };
        }
        return { isAi: false };
      },
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
