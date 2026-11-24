import { getStretch, type Stretch } from '../content/stretches';
import type { Routine } from '../content/routines';

/**
 * From this many weeks, lying flat on the back is out.
 *
 * The growing uterus presses on the inferior vena cava, which cuts venous return
 * and can drop blood pressure. ACOG puts the line somewhere between 16 and 20
 * weeks. We take the later, more permissive number and swap the pose rather than
 * warn about it, so there is no way for the player screen to show something unsafe.
 */
export const SUPINE_CUTOFF_WEEKS = 20;

export type Trimester = 1 | 2 | 3;

export function trimesterFor(weeks: number): Trimester {
  if (weeks < 14) return 1;
  if (weeks < 28) return 2;
  return 3;
}

export function trimesterLabel(weeks: number): string {
  const t = trimesterFor(weeks);
  const names = { 1: 'First', 2: 'Second', 3: 'Third' } as const;
  return `${names[t]} trimester, week ${weeks}`;
}

export function avoidsSupine(weeks: number): boolean {
  return weeks >= SUPINE_CUTOFF_WEEKS;
}

/**
 * The only function screens should use to get a routine's stretches.
 *
 * Swaps any back-lying stretch for its side-lying or seated alternate once she
 * is far enough along. Everything downstream then just renders what it is given.
 */
export function resolveRoutine(routine: Routine, weeks: number): Stretch[] {
  return routine.stretchIds.map((id) => {
    const stretch = getStretch(id);
    if (stretch.supineAfter20wk && avoidsSupine(weeks)) {
      if (!stretch.alternateId) {
        throw new Error(`${stretch.id} is flagged supineAfter20wk but has no alternateId`);
      }
      return getStretch(stretch.alternateId);
    }
    return stretch;
  });
}

/** How many stretches got swapped. Used to explain the change on the routine screen. */
export function swapCount(routine: Routine, weeks: number): number {
  if (!avoidsSupine(weeks)) return 0;
  return routine.stretchIds.filter((id) => getStretch(id).supineAfter20wk).length;
}

/** Weeks left, for the home screen greeting. Clamped so it never reads negative. */
export function weeksToGo(weeks: number): number {
  return Math.max(0, 40 - weeks);
}
