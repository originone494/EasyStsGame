import { createRun } from './run';
import { createDeck } from './deck';

export function createRunScenario(seed: number) {
  const run = createRun(seed);
  run.scenario = 'runRoute'; run.deck = createDeck(['debugRoute']);
  return run;
}
