export const TIME_ZONE = 'America/Sao_Paulo';

// Keep in sync with the cron in .github/workflows/edition.yml ("17 9,21 * * *"): 06:17 and 18:17 in São Paulo.
export const RUN_HOURS_UTC = [9, 21];
export const RUN_MINUTE_UTC = 17;

const SLOTS = [
  { from: 0, key: 'madrugada', label: 'Edição da madrugada' },
  { from: 6, key: 'manha', label: 'Edição da manhã' },
  { from: 12, key: 'tarde', label: 'Edição da tarde' },
  { from: 18, key: 'noite', label: 'Edição da noite' },
];

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

export function zonedParts(date) {
  const parts = Object.fromEntries(partsFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return { year: parts.year, month: parts.month, day: parts.day, hour: Number(parts.hour) };
}

/** Which of the four daily editions a moment belongs to, in São Paulo time. */
export function editionSlot(date) {
  const { year, month, day, hour } = zonedParts(date);
  const slot = SLOTS.findLast((candidate) => hour >= candidate.from);
  const slotHour = String(slot.from).padStart(2, '0');
  return { id: `${year}-${month}-${day}-${slotHour}h`, key: slot.key, label: slot.label };
}

/** Next scheduled run after `date`, following the workflow cron. */
export function nextRunAt(date) {
  const base = new Date(date);
  for (let dayOffset = 0; dayOffset <= 1; dayOffset += 1) {
    for (const hour of RUN_HOURS_UTC) {
      const candidate = new Date(
        Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + dayOffset, hour, RUN_MINUTE_UTC),
      );
      if (candidate > base) return candidate;
    }
  }
  throw new Error('unreachable: no run found within 48h');
}
