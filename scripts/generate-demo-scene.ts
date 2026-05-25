import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { demoScores } from "../src/generation/demoScores";
import { generateSceneFromScores } from "../src/generation/sceneGenerator";
import { parseIslandScene } from "../src/data/schema";

const scenePath = resolve("public/data/museeka_demo_scene.json");
const reportPath = resolve("public/data/museeka_generation_report.json");
const { scene, reports } = generateSceneFromScores(demoScores, 12345);

parseIslandScene(scene);

await mkdir(dirname(scenePath), { recursive: true });
await writeFile(scenePath, `${JSON.stringify(scene, null, 2)}\n`, "utf8");
await writeFile(reportPath, `${JSON.stringify({ version: "0.1", reports }, null, 2)}\n`, "utf8");

console.log(`Generated ${scene.paths.length} paths and ${scene.soundObjects.length} sound objects.`);
