import { STRETCHES, getStretch, type Stretch } from './stretches';
import { tagsFor } from './personalisation';
// Relative rather than aliased, so this file can be compiled and tested on its own.
import { avoidsSupine } from '../lib/trimester';

/**
 * Builds a routine around what someone actually told us bothers them.
 *
 * This is the paid tier. The three fixed routines are the same for everyone;
 * this one is assembled from the tagged stretch library using her aches and
 * goals, and it changes day to day so it does not go stale.
 *
 * Three rules it will not break:
 *  - Exactly 15 minutes, like every other routine
 *  - Nothing unsafe for how far along she is
 *  - Always opens with something gentle and closes with a breath, because
 *    dropping someone straight into a deep hip stretch is a bad way to start
 */

const TARGET_SEC = 15 * 60;
const OPENER = 'cat-cow';
const CLOSER = 'evening-breath';
const MIN_CLOSER_SEC = 60;

/** Stretches that suit a goal, beyond whatever her aches already pull in. */
const GOAL_PICKS: Record<string, string[]> = {
  easeAches: [],
  sleepBetter: ['childs-pose', 'legs-elevated-back', 'side-lying-quad', 'puppy-pose'],
  stayMoving: ['seated-side-bend', 'standing-side-stretch', 'standing-groin', 'standing-t'],
  reduceSwelling: ['seated-ankle-pumps', 'legs-elevated-back', 'standing-calf', 'hand-pumps'],
  prepareForLabour: ['supported-squat', 'connection-breath', 'reclined-butterfly', 'side-lying-clamshell'],
  deskBreak: ['seated-pelvic-tilt', 'chair-pigeon', 'doorway-chest', 'wrist-release', 'neck-release'],
};

export type BuildOptions = {
  aches: string[];
  goals: string[];
  weeks: number;
  /** Changes the pick among equally good stretches, so today differs from yesterday. */
  seed?: number;
};

/** Swap anything she should not be doing yet, exactly as the fixed routines do. */
function safeVersion(stretch: Stretch, weeks: number): Stretch {
  if (stretch.supineAfter20wk && avoidsSupine(weeks) && stretch.alternateId) {
    return getStretch(stretch.alternateId);
  }
  return stretch;
}

function scoreOf(id: string, aches: string[], goals: string[]): number {
  const tags = tagsFor(id);
  // Two points per sore spot it addresses. Aches are what she came for.
  let score = tags.filter((t) => aches.includes(t)).length * 2;
  // One point for serving a stated goal.
  for (const goal of goals) {
    if (GOAL_PICKS[goal]?.includes(id)) score += 1;
  }
  return score;
}

export function buildCustomRoutine({ aches, goals, weeks, seed = 0 }: BuildOptions): Stretch[] {
  const opener = safeVersion(getStretch(OPENER), weeks);
  const closer = safeVersion(getStretch(CLOSER), weeks);

  const scored = Object.keys(STRETCHES)
    .filter((id) => id !== OPENER && id !== CLOSER)
    // Breath-only entries are closers, not middle content.
    .filter((id) => id !== 'morning-breath')
    .map((id) => ({ id, score: scoreOf(id, aches, goals) }));

  /**
   * Shuffled within two bands, not ranked outright.
   *
   * Ranking strictly by score meant the same top four stretches won every single
   * day. Someone who named two sore spots got one identical routine for a
   * fortnight, while someone who named nothing got fourteen different ones. That
   * is exactly backwards: the more she tells us, the staler it got.
   *
   * Everything in the first band already addresses something she asked for, so
   * ordering within it by relevance buys very little and costs all the variety.
   * The band boundary is what preserves relevance; the shuffle inside it is what
   * keeps the app worth opening tomorrow.
   */
  const byDay = (a: { id: string }, b: { id: string }) => hash(a.id, seed) - hash(b.id, seed);
  const relevant = scored.filter((s) => s.score > 0).sort(byDay);
  const filler = scored.filter((s) => s.score === 0).sort(byDay);
  const candidates = [...relevant, ...filler];

  const picked: Stretch[] = [opener];
  const usedPoses = new Set<string>([opener.poseKey]);
  const usedIds = new Set<string>([opener.id]);
  let total = opener.durationSec;

  /** Adds a stretch if there is room and it does not repeat a drawing. */
  const tryAdd = (id: string): boolean => {
    if (usedIds.has(id)) return false;
    const stretch = safeVersion(getStretch(id), weeks);
    // One drawing per routine. Stops cat-cow and slow cat-cow both turning up,
    // and stops a swapped stretch duplicating its own alternate.
    if (usedPoses.has(stretch.poseKey)) return false;
    if (total + stretch.durationSec + MIN_CLOSER_SEC > TARGET_SEC) return false;

    picked.push(stretch);
    usedPoses.add(stretch.poseKey);
    usedIds.add(id);
    total += stretch.durationSec;
    return true;
  };

  // Pass one: guarantee every sore spot she named gets at least one stretch.
  //
  // Without this, an ache with few stretches loses the tiebreak to an ache with
  // many and drops out of the routine entirely. Someone who says her hands hurt
  // and gets nothing for her hands has been lied to, however good the rest is.
  for (const ache of aches) {
    const match = candidates.find(({ id }) => tagsFor(id).includes(ache) && !usedIds.has(id));
    if (match) tryAdd(match.id);
  }

  // Pass two: fill the remaining time with whatever scores best.
  for (const { id } of candidates) tryAdd(id);

  // The closer absorbs whatever is left, so the total is always exactly 15:00.
  picked.push({ ...closer, durationSec: TARGET_SEC - total });
  return picked;
}

/**
 * Small deterministic shuffle. The same seed gives the same routine, which is
 * what we want: today's routine should not change every time she opens the app.
 *
 * The seed has to go in at the start, not appended to the end of the string.
 * Appended, it only ever shifts the result by its own value, so every id moves
 * by the same amount and the ordering never actually changes. Seeded here, it
 * gets multiplied through every character and genuinely reshuffles.
 */
function hash(input: string, seed: number): number {
  let h = seed | 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h) % 1000;
}

/** Days since epoch. Used as the seed so the routine changes once a day, not per render. */
export function todaySeed(): number {
  return Math.floor(Date.now() / 86_400_000);
}
