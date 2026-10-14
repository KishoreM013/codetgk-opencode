#!/usr/bin/env node
import process from "node:process";
import { confirm } from "@inquirer/prompts";
import chalk from "chalk";
import { Command } from "commander";
import { runAgent } from "./agent.js";
import { OllamaProvider, OpenAICompatibleProvider } from "./providers.js";
import { saveSession } from "./session.js";
import { defaultConfig, loadConfig, resolveApiKey } from "./config.js";
import { launchOpenCode } from "./launch.js";
const program = new Command();
program.name("codetgk").description("A provider-neutral terminal coding agent").version("0.1.0");
function parseResearchRequest(task, flag) {
    const value = task?.trim() ?? "";
    const suffix = /(?:^|\s)--research\s*$/i.test(value);
    return {
        task: value.replace(/\s+--research\s*$/i, "").trim() || undefined,
        research: Boolean(flag || suffix),
    };
}
program.command("init").description("Create a starter project configuration").action(async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile("config.json", `${JSON.stringify(defaultConfig, null, 2)}\n`, { flag: "wx" }).catch(() => { });
    console.log(chalk.green("Initialized config.json. Set a provider, model, and API-key environment variable."));
});
function createProvider(config, name, model, baseUrl) {
    const settings = config.providers[name];
    if (!settings)
        throw new Error(`Unknown provider "${name}". Add it to config.json.`);
    const selectedModel = model ?? settings.model;
    const selectedBaseUrl = baseUrl ?? settings.baseUrl;
    return settings.type === "ollama"
        ? new OllamaProvider({ model: selectedModel, baseUrl: selectedBaseUrl })
        : new OpenAICompatibleProvider({ model: selectedModel, baseUrl: selectedBaseUrl, apiKey: resolveApiKey(settings) });
}
program.command("workflow <task>").description("Run the plan, explore, implement, test, and review workflow")
    .option("-p, --provider <provider>", "Provider name from config.json")
    .option("-m, --model <model>", "Override configured model")
    .option("--base-url <url>", "Provider base URL", process.env.CODETGK_BASE_URL)
    .option("--research", "Research the task using multiple public web sources")
    .action(async (task, options) => {
    const request = parseResearchRequest(task, options.research);
    const cwd = process.cwd();
    const config = await loadConfig(cwd);
    const provider = createProvider(config, options.provider ?? config.activeProvider, options.model, options.baseUrl);
    const approve = async (action) => confirm({ message: `Allow ${action}?`, default: false });
    const roles = ["planner", "explorer", "implementer", "tester", "reviewer"];
    let transcript = task;
    for (const role of roles) {
        console.log(chalk.yellow(`\n[${role}]`));
        const result = await runAgent({ cwd, provider, role, approve, research: request.research }, transcript, role);
        console.log(result);
        transcript += `\n\n${role} report:\n${result}`;
    }
    await saveSession(cwd, task, transcript);
});
program.argument("[task]", "Task to perform").option("-p, --provider <provider>", "Provider name from config.json")
    .option("-m, --model <model>", "Override configured model")
    .option("-t, --theme <name>", "Override configured theme", process.env.CODETGK_THEME)
    .option("--theme-mode <mode>", "Theme mode: system, dark, or light")
    .option("--base-url <url>", "Provider base URL", process.env.CODETGK_BASE_URL)
    .option("--research", "Ask the OpenCode agent to research multiple public web sources")
    .action(async (task, options) => {
    const cwd = process.cwd();
    const config = await loadConfig(cwd);
    const rawPrompt = process.argv.slice(2).find((value, index, args) => !value.startsWith("-") && !["--provider", "-p", "--model", "-m", "--base-url", "--theme", "-t", "--theme-mode"].includes(args[index - 1] ?? ""));
    const themeMode = options.themeMode;
    const themeOverride = options.theme || themeMode
        ? { name: options.theme ?? config.theme?.name ?? "codetgk-abyss", mode: themeMode ?? config.theme?.mode ?? "dark" }
        : undefined;
    const request = parseResearchRequest(task ?? rawPrompt, options.research);
    const prompt = request.research && request.task
        ? `${request.task}\n\nResearch mode: consult multiple independent public web sources, compare them, cite URLs, and give a concise synthesis.`
        : request.task;
    launchOpenCode(cwd, config, options.provider ?? config.activeProvider, prompt, themeOverride, options.model);
});
program.parseAsync().catch(error => {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
});
