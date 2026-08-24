import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);
const { chromium } = nodeRequire("@playwright/test");
const fixtures = await import("../e2e/mock/fixtures.ts");

const OUT = "/tmp/ux-shots";
mkdirSync(OUT, { recursive: true });

const PORT = 3777;
const server = spawn(process.execPath, ["scripts/serve-e2e.mjs"], {
  env: { ...process.env, E2E_PORT: String(PORT) },
  stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 800));

const browser = await chromium.launch();
const shots = [];
let ctx = undefined;
let page = undefined;
let mock = undefined;

const closePage = async () => {
  if (page !== undefined) await page.close().catch(() => undefined);
  if (ctx !== undefined) await ctx.close().catch(() => undefined);
  page = undefined;
  ctx = undefined;
};

const newPage = async ({ width = 1440, height = 900, theme = "light", transform } = {}) => {
  await closePage();
  ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    serviceWorkers: "block",
  });
  page = await ctx.newPage();
  const { createMockApi } = await import("../e2e/mock/app.ts");
  const { setTestSettings, installMockApi } = await import("../e2e/mock/install.ts");
  mock = createMockApi();
  if (transform !== undefined) transform(mock.state);
  await setTestSettings(page, { share: "off" });
  await page.addInitScript((themeValue) => {
    const raw = localStorage.getItem("emi-chat-settings");
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      parsed.state.settings.theme = themeValue;
      localStorage.setItem("emi-chat-settings", JSON.stringify(parsed));
    }
  }, theme);
  await installMockApi({ page, app: mock.app });
  return { page, mock };
};

const shoot = async (name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  shots.push(name);
  console.log("shot:", name);
};

// 1 session light
({ page } = await newPage());
await page.goto(`http://localhost:${PORT}/chat/one`);
await page.getByText("one message answer").waitFor();
await shoot("01-session-light");

// 2 new chat
({ page } = await newPage());
await page.goto(`http://localhost:${PORT}/chat`);
await page.waitForTimeout(1500);
await shoot("02-new-chat");

// 3+4 streaming + queue
{
  let releaseHeld;
  const held = new Promise((r) => {
    releaseHeld = r;
  });
  ({ page } = await newPage({
    transform: (state) => {
      state.chat.gate = held;
    },
  }));
  await page.goto(`http://localhost:${PORT}/chat/one`);
  await page.getByText("one message answer").waitFor();
  await page.getByLabel("Message input").fill("Held question");
  await page.getByLabel("Send message").click();
  await page.getByLabel("Stop generating").waitFor();
  await page.waitForTimeout(400);
  await shoot("03-streaming");
  await page.getByLabel("Message input").fill("Second while streaming");
  await page.getByLabel("Send after reply").click();
  await page.waitForTimeout(300);
  await shoot("04-queue-visible");
  releaseHeld();
}

// 5 error banner
({
  page,
} = await newPage({
  transform: (state) => {
    state.chat.stream = ({ messageId }) =>
      fixtures.providerErrorStream({ messageId, errorText: "Model overloaded, retry later." });
  },
}));
{
  const { providerErrorStream } = await import("../e2e/mock/fixtures.ts");
  await page.goto(`http://localhost:${PORT}/chat`);
  await page.waitForTimeout(1200);
  await page.getByLabel("Message input").fill("Trigger failure");
  await page.getByLabel("Send message").click();
  await page.getByText("Model overloaded").first().waitFor();
  await shoot("05-error-banner");
}

// 6 session actions menu
({ page } = await newPage());
await page.goto(`http://localhost:${PORT}/chat/one`);
await page.getByText("one message answer").waitFor();
await page.getByLabel("Session actions").first().click();
await page.waitForTimeout(400);
await shoot("06-session-actions");

// product pages
for (const [route, name] of [
  ["/memory", "07-memory-page"],
  ["/notes", "08-notes-page"],
  ["/workouts", "09-workouts-page"],
  ["/summary", "10-summary-page"],
  ["/upload", "11-upload-page"],
  ["/releases", "12-releases-page"],
]) {
  ({ page } = await newPage());
  await page.goto(`http://localhost:${PORT}${route}`);
  await page.waitForTimeout(900);
  await shoot(name);
}

// dark
({ page } = await newPage({ theme: "dark" }));
await page.goto(`http://localhost:${PORT}/chat/one`);
await page.getByText("one message answer").waitFor();
await shoot("13-session-dark");

// mobile
({ page } = await newPage({ width: 390, height: 844 }));
await page.goto(`http://localhost:${PORT}/chat/one`);
await page.getByText("one message answer").waitFor();
await shoot("14-mobile-session");
const toggle = page.getByLabel("Toggle Sidebar");
if ((await toggle.count()) > 0) {
  await toggle.click();
  await page.waitForTimeout(500);
  await shoot("15-mobile-sidebar");
}

// mobile dark new chat
({ page } = await newPage({ width: 390, height: 844, theme: "dark" }));
await page.goto(`http://localhost:${PORT}/chat`);
await page.waitForTimeout(1500);
await shoot("16-mobile-new-chat-dark");


writeFileSync(`${OUT}/index.json`, JSON.stringify(shots, null, 2));
await closePage();
server.kill();
await browser.close();
console.log("DONE", shots.length);
