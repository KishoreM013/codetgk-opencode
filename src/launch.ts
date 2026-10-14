import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Config } from "./config.js";

export function launchOpenCode(
  cwd: string,
  config: Config,
  providerName: string,
  prompt?: string,
  themeOverride?: { name: string; mode?: "system" | "dark" | "light" },
  modelOverride?: string
): never {
  const provider = config.providers[providerName];
  if (!provider) throw new Error(`Unknown provider "${providerName}". Add it to config.json.`);

  const environment = { ...process.env };
  const providerEnv = provider.apiKeyEnv ?? "CODETGK_PROVIDER_API_KEY";
  if (provider.apiKey) environment[providerEnv] = provider.apiKey;

  // Namespace the OpenCode provider id so we never clobber a built-in
  // provider (e.g. "opencode" is OpenCode's own Zen provider).
  const providerId = `codetgk-${providerName}`;
  const selectedModel = modelOverride ?? provider.model;

  const theme = themeOverride ?? config.theme;
  const opencodeConfig = {
    "$schema": "https://opencode.ai/config.json",
    animations: true,
    session: { permissions: "prompt", thinking: "show", sidebar: "auto" },
    ...(providerName === "opencode"
      ? {
          // Use OpenCode's built-in provider so its existing login credentials
          // and native free-model catalog remain available.
          model: `opencode/${selectedModel}`,
        }
      : {
          providers: {
            [providerId]: {
              name: `codetgk ${providerName}`,
              ...(provider.type === "openai-compatible"
                ? {
                    env: [providerEnv],
                    package: "@opencode/ai/providers/openai-compatible",
                    settings: { baseURL: provider.baseUrl },
                  }
                : {
                    env: provider.apiKey ? [providerEnv] : [],
                    package: "@opencode/ai/providers/openai-compatible",
                    settings: { baseURL: `${provider.baseUrl ?? "http://127.0.0.1:11434"}/v1` },
                  }),
              models: {
                [selectedModel]: { name: selectedModel },
              },
            },
          },
          model: `${providerId}/${selectedModel}`,
        }),
  };

  environment.OPENCODE_CONFIG_CONTENT = JSON.stringify(opencodeConfig);
  // Theme lives in the CLI/TUI config (cli.json), not the core config, so it
  // has to go through OPENCODE_CLI_CONFIG_CONTENT or it is silently ignored.
  if (theme) {
    environment.OPENCODE_CLI_CONFIG_CONTENT = JSON.stringify({
      $schema: "https://opencode.ai/v2/cli.json",
      theme: { name: theme.name, mode: theme.mode ?? "dark" }
    });
  }
  environment.OPENCODE_DISABLE_PROJECT_CONFIG = "true";

  // Prefer an explicit override, then the locally built codetgk TUI, then the
  // stock OpenCode install, then whatever is on PATH.
  const candidates = [
    process.env.CODETGK_OPENCODE_BIN,
    path.join(process.env.HOME ?? "", "Projects", "opencode", "packages", "cli", "dist", `cli-${process.platform}-${process.arch}`, "bin", "opencode"),
    path.join(process.env.HOME ?? "", ".opencode", "bin", "opencode")
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  const binary = candidates.find(candidate => fs.existsSync(candidate)) ?? "opencode";
  const args = ["--standalone"];
  if (prompt) args.push("--prompt", prompt);

  const result = spawnSync(binary, args, { cwd, env: environment, stdio: "inherit" });
  if (result.error) throw new Error(`Unable to start the TUI (${binary}): ${result.error.message}`);
  process.exit(result.status ?? 1);
}
