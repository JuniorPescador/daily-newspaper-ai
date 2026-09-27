// Time phrases for the page, in PT-BR. Pure functions, so they can be unit-tested.

/** How long ago `iso` was: whole units elapsed, never rounded up (36h is "ontem", not "há 2 dias"). */
export function ago(iso, now = Date.now()) {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'ontem' : `há ${days} dias`;
}

/** Countdown such as "3h 05min" or "12 min". */
export function duration(ms) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${String(minutes % 60).padStart(2, '0')}min` : `${minutes} min`;
}
