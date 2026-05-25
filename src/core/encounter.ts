import type { Encounter, PlayerState, SoundObject } from "./types";
import { evaluateField } from "./fields";
import { distance, dot, length, normalize, scale, sub } from "./vec3";

export function computeEncounter(player: PlayerState, object: SoundObject): Encounter {
  const objectPosition = object.transform.position;
  const relativePosition = sub(objectPosition, player.position);
  const distanceToObject = distance(player.position, objectPosition);
  const approachDirection = normalize(relativePosition);
  const approachSpeed = dot(player.velocity, approachDirection);
  const radialVelocity = scale(approachDirection, approachSpeed);
  const tangentialSpeed = length(sub(player.velocity, radialVelocity));
  const field = evaluateField(object.field, object.transform, player.position);

  return {
    objectId: object.id,
    playerPosition: player.position,
    playerVelocity: player.velocity,
    objectPosition,
    relativePosition,
    localPosition: field.localPosition,
    distance: distanceToObject,
    approachSpeed,
    tangentialSpeed,
    altitudeRelative: player.position[1] - objectPosition[1],
    approachDirection,
    field
  };
}

export function computeEncounters(player: PlayerState, objects: SoundObject[]): Encounter[] {
  return objects.map((object) => computeEncounter(player, object));
}
