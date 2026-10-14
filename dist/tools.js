import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
const exec = promisify(execFile);
const MAX_RESEARCH_CHARS = 12_000;
export const toolDefinitions = [
    { name: "read_file", description: "Read a UTF-8 text file inside the workspace.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
    { name: "write_file", description: "Write complete UTF-8 content to a workspace file.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } },
    { name: "list_files", description: "List entries in a workspace directory.", parameters: { type: "object", properties: { path: { type: "string" } } } },
    { name: "search_files", description: "Search workspace text with ripgrep. Prefer this over reading unrelated files.", parameters: { type: "object", properties: { query: { type: "string" }, path: { type: "string" } }, required: ["query"] } },
    { name: "shell", description: "Run a command in the workspace.", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } },
    { name: "git_status", description: "Show changed and untracked files before editing or reviewing.", parameters: { type: "object", properties: {} } },
    { name: "git_diff", description: "Show the current git diff.", parameters: { type: "object", properties: {} } }
];
toolDefinitions.push({
    name: "research_web",
    description: "Search the public web and read several independent pages for a concise, cited answer. Use only when research mode is enabled.",
    parameters: {
        type: "object",
        properties: { query: { type: "string" }, sources: { type: "number", minimum: 2, maximum: 5 } },
        required: ["query"],
    },
});
function safePath(cwd, candidate) {
    const resolved = path.resolve(cwd, candidate);
    if (resolved !== cwd && !resolved.startsWith(`${cwd}${path.sep}`))
        throw new Error("Path escapes the workspace");
    return resolved;
}
export async function runTool(name, args, cwd) {
    switch (name) {
        case "research_web": {
            const query = String(args.query ?? "").trim();
            if (!query)
                throw new Error("Research query cannot be empty");
            const sourceCount = Math.min(5, Math.max(2, Number(args.sources ?? 3)));
            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
            const searchResponse = await fetch(searchUrl, {
                headers: { "user-agent": "codetgk-research/1.0" },
                signal: AbortSignal.timeout(15_000),
            });
            if (!searchResponse.ok)
                throw new Error(`Web search failed (${searchResponse.status})`);
            const searchHtml = await searchResponse.text();
            const links = [...searchHtml.matchAll(/uddg=([^&"]+)/g)]
                .map((match) => decodeURIComponent(match[1]))
                .filter((url, index, all) => /^https:\/\//i.test(url) && all.indexOf(url) === index)
                .slice(0, sourceCount);
            if (!links.length)
                return "No public web sources were found.";
            const pages = await Promise.all(links.map(async (url, index) => {
                try {
                    const response = await fetch(url, {
                        headers: { "user-agent": "codetgk-research/1.0", accept: "text/html,text/plain" },
                        signal: AbortSignal.timeout(15_000),
                    });
                    if (!response.ok)
                        return `[Source ${index + 1}] ${url}\nFetch failed (${response.status})`;
                    const html = await response.text();
                    const text = html
                        .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
                        .replace(/<[^>]+>/g, " ")
                        .replace(/&nbsp;|&#160;/gi, " ")
                        .replace(/&amp;/gi, "&")
                        .replace(/\s+/g, " ")
                        .trim()
                        .slice(0, 3_000);
                    return `[Source ${index + 1}] ${url}\n${text || "No readable text extracted."}`;
                }
                catch (error) {
                    return `[Source ${index + 1}] ${url}\nFetch failed: ${error instanceof Error ? error.message : String(error)}`;
                }
            }));
            return pages.join("\n\n").slice(0, MAX_RESEARCH_CHARS);
        }
        case "read_file": return readFile(safePath(cwd, String(args.path)), "utf8");
        case "write_file": {
            const target = safePath(cwd, String(args.path));
            await writeFile(target, String(args.content), "utf8");
            return `Wrote ${path.relative(cwd, target)}`;
        }
        case "list_files": return (await readdir(safePath(cwd, String(args.path ?? ".")), { withFileTypes: true }))
            .map(entry => `${entry.isDirectory() ? "d" : "f"} ${entry.name}`).join("\n");
        case "search_files": {
            const query = String(args.query ?? "").trim();
            if (!query)
                throw new Error("Search query cannot be empty");
            const searchPath = safePath(cwd, String(args.path ?? "."));
            const { stdout } = await exec("rg", ["--line-number", "--hidden", "--glob", "!.git", "--glob", "!node_modules", query, searchPath], {
                cwd,
                maxBuffer: 2_000_000,
            });
            return stdout.trim() || "No matches";
        }
        case "shell": {
            const { stdout, stderr } = await exec("sh", ["-lc", String(args.command)], { cwd, maxBuffer: 2_000_000 });
            return `${stdout}${stderr}`.trim();
        }
        case "git_diff": {
            const { stdout } = await exec("git", ["diff", "--", "."], { cwd, maxBuffer: 4_000_000 });
            return stdout || "No changes";
        }
        case "git_status": {
            const { stdout } = await exec("git", ["status", "--short"], { cwd, maxBuffer: 1_000_000 });
            return stdout.trim() || "Clean worktree";
        }
        default: throw new Error(`Unknown tool: ${name}`);
    }
}
