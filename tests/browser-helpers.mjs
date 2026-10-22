import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";

export { chromium };
export const baseURL =
  process.env.LOCAL_NEUMATHE_URL || "http://127.0.0.1:4178";
const systemChrome =
  process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : undefined;
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  (systemChrome && existsSync(systemChrome) ? systemChrome : undefined);
export const browserOptions = {
  headless: true,
  ...(executablePath ? { executablePath } : {}),
};
await mkdir("artifacts", { recursive: true });
