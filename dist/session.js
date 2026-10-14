import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
export async function saveSession(cwd, user, assistant) {
    const directory = path.join(cwd, ".codetgk", "sessions");
    await mkdir(directory, { recursive: true });
    await appendFile(path.join(directory, `${new Date().toISOString().slice(0, 10)}.jsonl`), `${JSON.stringify({ timestamp: new Date().toISOString(), user, assistant })}\n`, "utf8");
}
