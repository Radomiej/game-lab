// Input packets belong to the scene that was active when they were emitted.
export function acceptsSceneInput(packet, sceneId) {
  return sceneId != null && packet.gameId === sceneId;
}
