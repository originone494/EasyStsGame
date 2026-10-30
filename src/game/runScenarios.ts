import { createRun } from './run';
import { createDeck } from './deck';
import type { ProgressionContent } from './selection';

export function createRunScenario(seed: number) {
  const run = createRun(seed);
  run.scenario = 'runRoute'; run.deck = createDeck(['debugRoute']);
  return run;
}

export function createRewardScenario(seed: number, content: ProgressionContent) {
  const run = createRun(seed, undefined, content);
  run.scenario = 'rewardRecruitment'; run.deck = createDeck(['debugRoute']);
  return run;
}
