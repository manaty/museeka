import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BUILTIN_MELODY_CORPUS } from "../src/melody/corpus/builtin";
import {
  createAnalysisSnapshot,
  MELODY_ANALYZER_ID,
  MELODY_ANALYZER_VERSION,
  MELODY_FEATURE_SCHEMA_VERSION
} from "../src/melody/analysis/snapshot";

async function main() {
  const outDir = resolve(process.cwd(), "public/data/melody-analysis");
  await mkdir(outDir, { recursive: true });

  const manifest = {
    schemaVersion: "1",
    analyzer: {
      id: MELODY_ANALYZER_ID,
      version: MELODY_ANALYZER_VERSION,
      featureSchemaVersion: MELODY_FEATURE_SCHEMA_VERSION
    },
    generatedAt: new Date().toISOString(),
    corpus: BUILTIN_MELODY_CORPUS.map(({ entry, melody }) => ({
      corpusId: entry.id,
      melodyId: melody.id,
      melodyHash: entry.melodyHash,
      snapshot: createAnalysisSnapshot(melody)
    }))
  };

  const filename = `analysis-${MELODY_ANALYZER_VERSION}-schema-${MELODY_FEATURE_SCHEMA_VERSION}.json`;
  const path = resolve(outDir, filename);
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Generated ${path}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
