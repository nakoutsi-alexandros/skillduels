import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appPath = path.join(root, "src", "App.jsx");
const outputDir = path.join(root, "public", "avatars", "ui");
const source = await readFile(appPath, "utf8");
const pattern = /"([^"]+)":\s*"data:image\/png;base64,([A-Za-z0-9+/=]+)"/g;
const matches = [...source.matchAll(pattern)];

if (!matches.length) {
  console.log("No embedded PNG avatars found.");
  process.exit(0);
}

await mkdir(outputDir, { recursive: true });
for (const match of matches) {
  const key = match[1];
  if (!/^[a-z0-9_-]+$/i.test(key)) {
    throw new Error(`Unsafe avatar key: ${key}`);
  }
  await writeFile(
    path.join(outputDir, `${key}.png`),
    Buffer.from(match[2], "base64"),
  );
}

const rewritten = source.replace(
  pattern,
  (_whole, key) => `"${key}": "/avatars/ui/${key}.png"`,
);
await writeFile(appPath, rewritten, "utf8");
console.log(`Extracted ${matches.length} avatars to public/avatars/ui.`);
