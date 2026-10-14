function parseResponse(data) {
    const message = data.choices?.[0]?.message ?? {};
    const toolCalls = (message.tool_calls ?? []).map((call) => ({
        id: call.id ?? crypto.randomUUID(),
        name: call.function?.name ?? call.name,
        arguments: typeof call.function?.arguments === "string"
            ? JSON.parse(call.function.arguments)
            : call.function?.arguments ?? call.arguments ?? {}
    }));
    return { content: message.content ?? "", toolCalls, finishReason: data.choices?.[0]?.finish_reason };
}
export class OpenAICompatibleProvider {
    options;
    constructor(options) {
        this.options = options;
    }
    async chat(messages, tools) {
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
        if (!response.ok)
            throw new Error(`Provider request failed (${response.status}): ${await response.text()}`);
        return parseResponse(await response.json());
    }
}
export class OllamaProvider {
    options;
    constructor(options) {
        this.options = options;
    }
    async chat(messages, tools) {
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
        if (!response.ok)
            throw new Error(`Ollama request failed (${response.status}): ${await response.text()}`);
        const data = await response.json();
        const message = data.message ?? {};
        return {
            content: message.content ?? "",
            toolCalls: (message.tool_calls ?? []).map((call) => ({
                id: crypto.randomUUID(),
                name: call.function?.name ?? call.name,
                arguments: call.function?.arguments ?? call.arguments ?? {}
            }))
        };
    }
}
