import { hasEditionOn } from './store.mjs';
import { localDate, previousRunAt } from './time.mjs';

/**
 * On startup, publish right away only when today's run time has passed and today still has no
 * edition (the process was down at 05:00). Before 05:00 the regular schedule takes care of it.
 */
export function shouldCatchUp(index, now) {
  const today = localDate(now);
  return localDate(previousRunAt(now)) === today && !hasEditionOn(index, today);
}
