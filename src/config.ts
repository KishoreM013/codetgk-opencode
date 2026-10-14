import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const providerSchema = z.object({
  type: z.enum(["ollama", "openai-compatible"]),
  model: z.string().min(1),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  apiKeyEnv: z.string().optional()
});

const themeSchema = z.object({
  name: z.string().min(1),
  mode: z.enum(["system", "dark", "light"]).default("dark")
});

const configSchema = z.object({
  activeProvider: z.string().min(1).default("opencode"),
  theme: themeSchema.optional(),
  providers: z.record(providerSchema)
});

export type Config = z.infer<typeof configSchema>;

export const defaultConfig: Config = {
  activeProvider: "opencode",
  theme: { name: "codetgk-abyss", mode: "dark" },
  providers: {
    ollama: { type: "ollama", model: "qwen2.5-coder", baseUrl: "http://127.0.0.1:11434" },
    opencode: {
      type: "openai-compatible",
      model: "big-pickle",
      baseUrl: "https://opencode.ai/zen/v1",
      apiKeyEnv: "OPENCODE_API_KEY"
    },
    nvidia: {
      type: "openai-compatible",
      model: "replace-with-nvidia-model",
      baseUrl: "https://integrate.api.nvidia.com/v1",
      apiKeyEnv: "NVIDIA_API_KEY"
    },
    openrouter: {
      type: "openai-compatible",
      model: "replace-with-openrouter-model",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKeyEnv: "OPENROUTER_API_KEY"
    }
  }
};

export async function loadConfig(cwd: string): Promise<Config> {
  const candidates = [path.join(cwd, "config.json"), path.join(cwd, ".codetgk", "config.json")];
  for (const filename of candidates) {
    try {
      const parsed: unknown = JSON.parse(await readFile(filename, "utf8"));
      return configSchema.parse(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw new Error(`Invalid ${path.relative(cwd, filename)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return defaultConfig;
}

export function resolveApiKey(provider: Config["providers"][string]): string | undefined {
  return provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : provider.apiKey;
}
