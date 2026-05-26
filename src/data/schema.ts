import { z } from "zod";
import type { IslandScene } from "../core/types";

const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
const curveSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("linear") }),
  z.object({ type: z.literal("smoothstep") }),
  z.object({ type: z.literal("smootherstep") }),
  z.object({ type: z.literal("exponential"), k: z.number() }),
  z.object({ type: z.literal("gaussian"), center: z.number(), sigma: z.number().positive() }),
  z.object({ type: z.literal("threshold"), threshold: z.number() }),
  z.object({ type: z.literal("plateau"), inner: z.number(), outer: z.number() })
]);

const falloffSchema = z
  .object({
    distance: curveSchema.optional(),
    angle: curveSchema.optional(),
    altitude: curveSchema.optional()
  })
  .optional();

const fieldSchema = z.discriminatedUnion("shape", [
  z.object({
    shape: z.literal("sphere"),
    params: z.object({ radius: z.number().positive() }),
    falloff: falloffSchema
  }),
  z.object({
    shape: z.literal("ellipsoid"),
    params: z.object({ radius: vec3Schema }),
    falloff: falloffSchema
  }),
  z.object({
    shape: z.literal("cone"),
    params: z.object({ range: z.number().positive(), angleDegrees: z.number().positive(), direction: vec3Schema }),
    falloff: falloffSchema
  }),
  z.object({
    shape: z.literal("ring"),
    params: z.object({ centerRadius: z.number().positive(), thickness: z.number().positive(), heightRange: z.tuple([z.number(), z.number()]) }),
    falloff: falloffSchema
  })
]);

const transformSchema = z.object({
  position: vec3Schema,
  rotation: vec3Schema,
  scale: vec3Schema
});

const instrumentSchema = z.enum(["glass_bell", "warm_pad", "flute", "woodblock", "low_pad", "pluck", "crystal", "piano", "violin", "cello"]);

const audioSchema = z.discriminatedUnion("generator", [
  z.object({ generator: z.literal("note"), instrument: instrumentSchema, baseNote: z.string(), duration: z.number().positive(), velocity: z.number().min(0).max(1) }),
  z.object({ generator: z.literal("chord"), instrument: instrumentSchema, notes: z.array(z.string()).min(1), duration: z.number().positive(), velocity: z.number().min(0).max(1) }),
  z.object({
    generator: z.literal("phrase"),
    instrument: instrumentSchema,
    notes: z.array(z.object({ dt: z.number().min(0), note: z.string(), duration: z.number().positive(), velocity: z.number().min(0).max(1).optional() })).min(1)
  }),
  z.object({ generator: z.literal("drone"), instrument: instrumentSchema, notes: z.array(z.string()).min(1), continuous: z.literal(true), velocity: z.number().min(0).max(1).optional() }),
  z.object({ generator: z.literal("percussion"), instrument: instrumentSchema, pattern: z.array(z.object({ dt: z.number().min(0), velocity: z.number().min(0).max(1) })).min(1) })
]);

const visualSchema = z.object({
  model: z.enum(["flower", "tree", "rock", "statue", "arch", "bird", "crab", "crystal", "temple", "waterfall"]),
  color: z.string(),
  activeGlow: z.boolean().optional()
});

const mappingSchema = z.object({
  input: z.enum([
    "field.intensity",
    "field.distanceFactor",
    "field.angleFactor",
    "field.altitudeFactor",
    "encounter.distance",
    "encounter.approachSpeed",
    "encounter.altitudeRelative",
    "encounter.tangentialSpeed"
  ]),
  output: z.enum(["volume", "pitchSemitones", "filterCutoff", "attack", "release", "brightness", "pan", "reverbSend"]),
  curve: curveSchema,
  range: z.tuple([z.number(), z.number()]),
  clampInput: z.tuple([z.number(), z.number()]).optional()
});

const soundObjectSchema = z.object({
  id: z.string(),
  kind: z.string(),
  transform: transformSchema,
  field: fieldSchema,
  trigger: z.object({
    mode: z.enum(["enter", "peak", "continuous"]),
    threshold: z.number().min(0).max(1),
    cooldown: z.number().min(0),
    retrigger: z.boolean().optional()
  }),
  audio: audioSchema,
  mappings: z.array(mappingSchema),
  visual: visualSchema
});

const pathSchema = z.object({
  id: z.string(),
  name: z.string(),
  duration: z.number().positive(),
  mode: z.literal("flying"),
  speedScale: z.number().positive(),
  constraints: z.object({
    maxSpeed: z.number().positive(),
    maxAcceleration: z.number().positive(),
    maxCurvature: z.number().positive(),
    minGroundClearance: z.number().nonnegative(),
    maxGroundClearance: z.number().positive()
  }),
  points: z.array(z.object({ t: z.number().min(0), p: vec3Schema })).min(2),
  interpolation: z.literal("catmull-rom")
});

export const islandSceneSchema = z.object({
  version: z.literal("0.1"),
  meta: z.object({
    name: z.string(),
    author: z.string(),
    description: z.string(),
    generatedAt: z.string().optional()
  }),
  terrain: z.object({
    type: z.literal("simple_island"),
    radius: z.number().positive(),
    heightScale: z.number().positive(),
    seed: z.number()
  }),
  paths: z.array(pathSchema).min(1),
  soundObjects: z.array(soundObjectSchema),
  visualObjects: z.array(z.object({ id: z.string(), kind: z.string(), transform: transformSchema, visual: visualSchema })),
  settings: z.object({
    defaultPathId: z.string(),
    audio: z.object({
      masterVolume: z.number().min(0).max(1),
      maxActiveVoices: z.number().int().positive()
    })
  })
}) satisfies z.ZodType<IslandScene>;

export function parseIslandScene(input: unknown): IslandScene {
  return islandSceneSchema.parse(input);
}
