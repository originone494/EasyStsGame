import type { MapGenerationConfig } from '../game/model';

// Five random-position safe nodes: one shop and four events.
// The floor's only campfire is the extra fixed camp near the Boss.
// Elite defaults remain disabled until their count/base reward is confirmed.
export const mapRules: MapGenerationConfig = {
  safeNodesPerFloor: 5, elitesPerFloor: 0,
  eliteBaseGold: 0, eliteBaseAttributes: { sunAdaptation: 0, rainAdaptation: 0, windAdaptation: 0 },
};
