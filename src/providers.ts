import type { ChatMessage, LlmProvider, ModelResponse, ToolDefinition, ToolCall } from "./types.js";

type ProviderOptions = {
  model: string;
  baseUrl?: string;
  apiKey?: string;
};

function parseResponse(data: Record<string, any>): ModelResponse {
  const message = data.choices?.[0]?.message ?? {};
  const toolCalls: ToolCall[] = (message.tool_calls ?? []).map((call: any) => ({
    id: call.id ?? crypto.randomUUID(),
    name: call.function?.name ?? call.name,
    arguments: typeof call.function?.arguments === "string"
      ? JSON.parse(call.function.arguments)
      : call.function?.arguments ?? call.arguments ?? {}
  }));
  return { content: message.content ?? "", toolCalls, finishReason: data.choices?.[0]?.finish_reason };
}

export class OpenAICompatibleProvider implements LlmProvider {
  constructor(private readonly options: ProviderOptions) {}

  async chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ModelResponse> {
    const baseUrl = (this.options.baseUrl ?? "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: this.options.model,
        messages,
        ...(tools.length ? { tools: tools.map(tool => ({ type: "function", function: tool })) } : {})
      })
    });
    if (!response.ok) throw new Error(`Provider request failed (${response.status}): ${await response.text()}`);
    return parseResponse(await response.json() as Record<string, any>);
  }
}

export class OllamaProvider implements LlmProvider {
  constructor(private readonly options: ProviderOptions) {}

  async chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ModelResponse> {
    const baseUrl = (this.options.baseUrl ?? "http://127.0.0.1:11434").replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.options.model,
        messages,
        stream: false,
        ...(tools.length ? { tools: tools.map(tool => ({ type: "function", function: tool })) } : {})
      })
    });
    if (!response.ok) throw new Error(`Ollama request failed (${response.status}): ${await response.text()}`);
    const data = await response.json() as any;
    const message = data.message ?? {};
    return {
      content: message.content ?? "",
      toolCalls: (message.tool_calls ?? []).map((call: any) => ({
        id: crypto.randomUUID(),
        name: call.function?.name ?? call.name,
        arguments: call.function?.arguments ?? call.arguments ?? {}
      }))
    };
  }
}
