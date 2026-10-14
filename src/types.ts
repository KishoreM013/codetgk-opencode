export type Role = "planner" | "explorer" | "implementer" | "tester" | "reviewer";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  toolCallId?: string;
};

export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ModelResponse = {
  content: string;
  toolCalls: ToolCall[];
  finishReason?: string;
};

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type LlmProvider = {
  chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ModelResponse>;
};

export type AgentContext = {
  cwd: string;
  role: Role;
  provider: LlmProvider;
  approve: (action: string) => Promise<boolean>;
  research?: boolean;
};
