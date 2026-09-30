// Reading time of an edition. Pure functions, so they can be unit-tested.

const WORDS_PER_MINUTE = 200;

/** Words the page shows for the edition: editorial, "Hoje na edição" and every story as displayed. */
export function editionWords(edition) {
  const texts = [edition.editorial, ...(edition.highlights ?? []).map((line) => line.text)];
  // Brief stories carry no summary, so only their title counts.
  for (const story of edition.stories ?? []) texts.push(story.title, story.summary, story.whyItMatters);
  return texts.filter(Boolean).join(' ').split(/\s+/).filter(Boolean).length;
}

/** Whole minutes, rounded up, at least 1. */
export function readingMinutes(edition, wordsPerMinute = WORDS_PER_MINUTE) {
  return Math.max(1, Math.ceil(editionWords(edition) / wordsPerMinute));
}
