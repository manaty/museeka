import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { parseIslandScene } from "../../src/data/schema";
import { computeEncounters } from "../../src/core/encounter";
import { samplePathState } from "../../src/core/path";
import { demoScores } from "../../src/generation/demoScores";
import { generateSceneFromScores } from "../../src/generation/sceneGenerator";
import { clusterSpatialEvents, toSpatialScore } from "../../src/generation/clustering";
import { parseMidiArrayBuffer } from "../../src/music/midi";
import { velocityToGain } from "../../src/music/velocity";

describe("generation pipeline", { timeout: 60_000 }, () => {
  it("generates deterministic valid scenes", () => {
    const first = generateSceneFromScores(demoScores, 12345);
    const second = generateSceneFromScores(demoScores, 12345);

    expect(first.scene).toEqual(second.scene);
    expect(parseIslandScene(first.scene).paths).toHaveLength(5);
    expect(first.scene.soundObjects.length).toBeGreaterThan(12);
  });

  it("does not start the public melody path with foreign continuous drones active", () => {
    const { scene } = generateSceneFromScores(demoScores, 12345);
    const path = scene.paths[0];
    const player = samplePathState(path, 0, 0);
    const activeContinuous = computeEncounters(player, scene.soundObjects)
      .filter((encounter) => encounter.field.intensity >= 0.34)
      .map((encounter) => scene.soundObjects.find((object) => object.id === encounter.objectId))
      .filter((object) => object?.trigger.mode === "continuous");

    expect(activeContinuous).toHaveLength(0);
  });

  it("clusters reusable spatial events", () => {
    const spatial = toSpatialScore(demoScores[0]);
    const clusters = clusterSpatialEvents(spatial, 123);
    expect(clusters.some((cluster) => cluster.events.length > 1)).toBe(true);
  });

  it("parses browser MIDI data into a MusicScore", () => {
    const midi = new Midi();
    const track = midi.addTrack();
    track.addNote({ midi: 60, time: 0, duration: 0.4, velocity: 0.8 });
    track.addNote({ midi: 64, time: 0.5, duration: 0.4, velocity: 0.7 });
    const bytes = midi.toArray();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const score = parseMidiArrayBuffer(copy.buffer, "unit");
    expect(score.events.length).toBeGreaterThanOrEqual(1);
    expect(score.tracks?.[0]?.notes).toHaveLength(2);
    expect(score.tracks?.[0]?.notes[0]).toMatchObject({ note: "C4", midi: 60, time: 0, ticks: 0 });
    expect(score.ppq).toBeGreaterThan(0);
    expect(score.tempo).toBeGreaterThan(0);
  });

  it("maps MIDI velocity to audible playback gain", () => {
    expect(velocityToGain(0)).toBe(0);
    expect(velocityToGain(0.1)).toBeGreaterThan(0.3);
    expect(velocityToGain(0.5)).toBeGreaterThan(0.65);
    expect(velocityToGain(1)).toBe(1);
  });
});
