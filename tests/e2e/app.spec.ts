import { expect, test } from "@playwright/test";

const minimalMidi = Uint8Array.from([
  0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01, 0xe0,
  0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x14,
  0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
  0x00, 0x90, 0x3c, 0x40,
  0x83, 0x60, 0x80, 0x3c, 0x00,
  0x00, 0xff, 0x2f, 0x00
]);

async function expectCanvasHasVariedPixels(page: import("@playwright/test").Page, hostTestId: string) {
  const canvas = page.getByTestId(hostTestId).locator("canvas");
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(600);
  await canvas.screenshot({ path: `test-results/${hostTestId}.png` });

  const samples = await canvas.evaluate((element: HTMLCanvasElement) => {
    const gl = element.getContext("webgl2") ?? element.getContext("webgl");
    if (!gl) return [];

    const width = element.width;
    const height = element.height;
    const points = [
      [0.2, 0.25],
      [0.5, 0.25],
      [0.8, 0.25],
      [0.2, 0.5],
      [0.5, 0.5],
      [0.8, 0.5],
      [0.2, 0.75],
      [0.5, 0.75],
      [0.8, 0.75]
    ];

    return points.map(([x, y]) => {
      const pixel = new Uint8Array(4);
      gl.readPixels(Math.floor(width * x), Math.floor(height * y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return Array.from(pixel);
    });
  });

  const uniqueColors = new Set(samples.map((sample) => sample.slice(0, 3).join(",")));
  expect(samples.length).toBeGreaterThan(0);
  expect(uniqueColors.size).toBeGreaterThan(1);
}

test("public demo starts and exposes playable controls", async ({ page }) => {
  await page.goto("/");
  await expectCanvasHasVariedPixels(page, "demo-canvas-host");
  const startButton = page.getByTestId("start-button");
  await expect(startButton).toBeVisible();
  await expect(startButton).toBeEnabled({ timeout: 45_000 });
  await startButton.click();
  await expect(page.getByTestId("path-select")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("path-select").locator("option")).toHaveCount(5, { timeout: 10_000 });
});

test("public demo canvas renders on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expectCanvasHasVariedPixels(page, "demo-canvas-host");
});

test("studio imports MIDI, edits objects and keeps export available", async ({ page }) => {
  await page.goto("/studio/");
  await expect(page.getByTestId("pipeline-panel")).toBeVisible();
  await expect(page.getByTestId("studio-stage-source")).toBeVisible();
  await expect(page.getByTestId("top-path-select")).toBeVisible();
  await expect(page.getByTestId("top-path-select").locator("option")).toHaveCount(5);
  await page.getByTestId("top-path-select").selectOption({ label: "Canon Ground" });
  await expect(page.getByTestId("pipeline-panel")).toContainText("Canon Ground");
  await page.getByTestId("top-path-select").selectOption({ label: "C Major Prelude" });
  await page.getByTestId("studio-stage-source").click();
  await expect(page.getByTestId("studio-canvas-host")).toHaveCount(0);
  await expect(page.getByTestId("midi-visualizer")).toBeVisible();
  await expect(page.getByTestId("midi-roll")).toBeVisible();
  await expect(page.getByTestId("raw-midi-table")).toContainText("Score interne");
  await expect(page.getByTestId("midi-column-help")).toContainText("début en secondes");

  await page.getByTestId("midi-input").setInputFiles({
    name: "demo.mid",
    mimeType: "audio/midi",
    buffer: Buffer.from(minimalMidi)
  });

  await expect(page.getByText(/MIDI importé/)).toBeVisible();
  await expect(page.getByTestId("raw-midi-table")).toContainText("MIDI parsé");
  await expect(page.getByTestId("raw-midi-table")).toContainText("C4");
  await expect(page.getByTestId("midi-play-button")).toBeEnabled();
  await page.getByTestId("studio-stage-analysis").click();
  await expect(page.getByTestId("analysis-events")).toContainText("note");
  await page.getByTestId("studio-stage-spatial-fold").click();
  await expectCanvasHasVariedPixels(page, "studio-canvas-host");
  await expect(page.getByTestId("spatial-fold-panel")).toContainText("ancres pitch");
  await expect(page.getByTestId("fold-timeline")).toBeVisible();
  await page.getByTestId("add-object").click();
  await expect(page.getByTestId("object-inspector")).toBeVisible();
  await expect(page.getByTestId("export-json")).toBeVisible();
});
