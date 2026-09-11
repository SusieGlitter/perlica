import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const attempts = Number.parseInt(process.env.WULING_CAPTURE_ATTEMPTS ?? "3", 10);
const captureScript = fileURLToPath(new URL("./capture-hd.mjs", import.meta.url));

for (let attempt = 1; attempt <= attempts; attempt++) {
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [captureScript], {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      env: {
        ...process.env,
        WULING_CAPTURE_ATTEMPT: String(attempt),
      },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`capture terminated by signal ${signal}`));
      else resolve(code ?? 1);
    });
  });
  if (exitCode === 0) {
    process.exit(0);
  }
  if (attempt < attempts) {
    console.warn(
      `[capture] attempt ${attempt} failed; retrying ${attempt + 1}/${attempts}`,
    );
  }
}

console.error(`[capture] all ${attempts} attempts failed`);
process.exit(1);
