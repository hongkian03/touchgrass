export type PromptKind = "text" | "image" | "video";
export type PromptClass = "small_ok" | "needs_big";

export type UsageRow = {
  ts: string;
  provider: string;
  model: string;
  kind: PromptKind;
  prompt_text: string;
  response_text?: string;
  regenerated: boolean;
};

export type Platform = {
  id: string;
  name: string;
  hosts: string[];
  icon: string;
  defaultModel: string;
  smallModel: string;
  kind: PromptKind | string;
};

export type RouteSuggestion = {
  action: "switch_model" | "open_paste";
  targetUrl?: string;
  targetModel: string;
  reason: string;
};
