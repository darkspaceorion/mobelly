import { POSE_KEYS } from '@/components/PoseArt';
import { ROUTINES, rawStretches } from '@/content/routines';
import { STRETCHES, getStretch } from '@/content/stretches';
import { SUPINE_CUTOFF_WEEKS, resolveRoutine } from '@/lib/trimester';
import { ACHES, STRETCH_TAGS } from '@/content/personalisation';

/**
 * Checks the content is internally consistent. Runs on app start in development
 * and prints to the console. Never runs in a release build.
 *
 * This exists because the safety promise of the app is a content promise, not a
 * code one. A stretch flagged as unsafe after 20 weeks but missing its
 * replacement would throw mid-routine, and a routine that quietly drifted to 13
 * minutes would make the app a liar. Both are the kind of mistake you make while
 * editing a data file at speed, so they get caught automatically.
 */

export const ROUTINE_TARGET_SEC = 15 * 60;

export function checkContent(): string[] {
  const problems: string[] = [];

  // Every stretch must have a drawing.
  for (const stretch of Object.values(STRETCHES)) {
    if (!POSE_KEYS.includes(stretch.poseKey)) {
      problems.push(`${stretch.id}: no pose art for key "${stretch.poseKey}"`);
    }
    if (stretch.cues.length === 0) {
      problems.push(`${stretch.id}: has no cues`);
    }
  }

  // Anything unsafe later on must have somewhere safe to go.
  for (const stretch of Object.values(STRETCHES)) {
    if (!stretch.supineAfter20wk) continue;
    if (!stretch.alternateId) {
      problems.push(`${stretch.id}: flagged supineAfter20wk with no alternateId`);
      continue;
    }
    const alt = STRETCHES[stretch.alternateId];
    if (!alt) {
      problems.push(`${stretch.id}: alternateId "${stretch.alternateId}" does not exist`);
    } else if (alt.supineAfter20wk) {
      problems.push(`${stretch.id}: its alternate "${alt.id}" is also a back-lying stretch`);
    } else if (alt.durationSec !== stretch.durationSec) {
      // Otherwise the routine changes length depending on how far along she is.
      problems.push(
        `${stretch.id}: alternate "${alt.id}" runs ${alt.durationSec}s against ${stretch.durationSec}s`,
      );
    }
  }

  // The ache tags have to line up with both the stretches and the ache list, or
  // "good for your lower back" starts pointing at nothing.
  const acheIds = ACHES.map((a) => a.id);
  for (const [stretchId, tags] of Object.entries(STRETCH_TAGS)) {
    if (!STRETCHES[stretchId]) {
      problems.push(`STRETCH_TAGS has "${stretchId}", which is not a stretch`);
    }
    for (const tag of tags) {
      if (!acheIds.includes(tag)) {
        problems.push(`${stretchId}: "${tag}" is not one of the aches we ask about`);
      }
    }
  }
  for (const id of Object.keys(STRETCHES)) {
    if (!STRETCH_TAGS[id]) problems.push(`${id}: has no entry in STRETCH_TAGS`);
  }

  for (const routine of ROUTINES) {
    // Every id in a routine must resolve.
    for (const id of routine.stretchIds) {
      try {
        getStretch(id);
      } catch {
        problems.push(`${routine.id}: unknown stretch id "${id}"`);
      }
    }

    // Fifteen minutes, at any stage of pregnancy.
    for (const weeks of [12, SUPINE_CUTOFF_WEEKS + 4]) {
      const total = resolveRoutine(routine, weeks).reduce((s, x) => s + x.durationSec, 0);
      if (total !== ROUTINE_TARGET_SEC) {
        problems.push(`${routine.id} at ${weeks} weeks: ${total}s, expected ${ROUTINE_TARGET_SEC}s`);
      }
    }

    // Nothing back-lying should survive past the cutoff.
    const late = resolveRoutine(routine, SUPINE_CUTOFF_WEEKS + 1).filter((s) => s.supineAfter20wk);
    if (late.length > 0) {
      problems.push(`${routine.id}: still shows ${late.map((s) => s.id).join(', ')} after the cutoff`);
    }

    if (rawStretches(routine).length < 5) {
      problems.push(`${routine.id}: fewer than 5 stretches`);
    }
  }

  return problems;
}

/** Called once from the root layout. */
export function runContentCheck(): void {
  if (!__DEV__) return;
  const problems = checkContent();
  if (problems.length === 0) {
    console.log('[content] all routines check out');
  } else {
    console.warn(`[content] ${problems.length} problem(s):\n - ${problems.join('\n - ')}`);
  }
}
