import { test } from "@playwright/test";

test("capture pachelbel path", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("http://localhost:5173/");
  await page.getByTestId("start-button").click({ timeout: 90000 });
  await page.getByTestId("path-select").waitFor({ timeout: 45000 });
  await page.getByTestId("path-select").selectOption({ label: "Canon in D" });
  await page.getByTestId("debug-toggle").check({ force: true });
  await page.waitForTimeout(8000); // let firefly travel a bit
  await page.screenshot({ path: "/tmp/museeka-pachelbel-path.png" });
});
