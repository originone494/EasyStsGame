import type { MapGenerationConfig } from '../game/model';

// Five random safe nodes per floor; the fixed pre-Boss camp is extra.
// Extra-slot weights are adjustable development defaults, not final balance.
// Elite defaults remain disabled until their count/base reward is confirmed.
export const mapRules: MapGenerationConfig = {
  safeNodesPerFloor: 5, minimumShops: 1, minimumCampfires: 1,
  safeNodeWeights: { shop: 1, campfire: 1, event: 1 }, elitesPerFloor: 0,
  eliteBaseGold: 0, eliteBaseAttributes: { sunAdaptation: 0, rainAdaptation: 0, windAdaptation: 0 },
};
