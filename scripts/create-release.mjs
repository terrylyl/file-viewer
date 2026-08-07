import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = packageJson.version;
const releaseName = `table-viewer-v${version}`;
const distDir = join(root, "dist");
const releaseDir = join(distDir, releaseName);
const archivePath = join(distDir, `${releaseName}.zip`);
const checksumPath = `${archivePath}.sha256`;
const releaseFiles = ["index.html"];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function escapePowerShellLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function createArchive() {
  if (process.platform === "win32") {
    const command = `Compress-Archive -LiteralPath ${escapePowerShellLiteral(releaseDir)} -DestinationPath ${escapePowerShellLiteral(archivePath)} -CompressionLevel Optimal`;
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { stdio: "inherit" });
    if (result.status === 0) return;
    throw new Error("Compress-Archive failed while creating the release archive.");
  }
  const result = spawnSync("zip", ["-q", "-r", archivePath, releaseName], { cwd: distDir, stdio: "inherit" });
  if (result.status !== 0) throw new Error("zip failed while creating the release archive.");
}

await rm(distDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });
for (const file of releaseFiles) {
  await cp(join(root, file), join(releaseDir, file));
}
await createArchive();
await writeFile(checksumPath, `${sha256(await readFile(archivePath))}  ${releaseName}.zip\n`);
console.log(`Created ${archivePath}`);
console.log(`Created ${checksumPath}`);
