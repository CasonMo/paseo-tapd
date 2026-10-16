// 从 skill/paseo-tapd/ 生成 server/skill-files.ts（编译产物内置技能内容，git 安装零依赖）
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const skillRoot = path.join(root, "skill", "paseo-tapd");
const outFile = path.join(root, "server", "skill-files.ts");

async function walk(dir, base = "") {
  const files = {};
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(files, await walk(full, rel));
    else files[rel] = await fs.readFile(full, "utf8");
  }
  return files;
}

const files = await walk(skillRoot);
const content = `// 由 scripts/build-skill-embed.mjs 从 skill/paseo-tapd/ 生成，请勿手改。\n// \u91cd\u65b0\u751f\u6210\uff1anpm run build:skill\nexport const SKILL_FILES: Record<string, string> = ${JSON.stringify(files, null, 2)};\n`;
await fs.writeFile(outFile, content, "utf8");
console.log("embedded", Object.keys(files).length, "file(s) ->", path.relative(root, outFile));
