import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import type { Stretch } from '../content/stretches';

/**
 * The engine that runs a routine. Every player screen behaviour comes from here,
 * so the screen itself is just paint.
 *
 * Two decisions worth knowing about:
 *
 * 1. Time comes from Date.now(), not from counting ticks. Phones throttle timers
 *    and a 15 minute routine counted by intervals drifts badly. We store when the
 *    current run started and how much time was banked before the last pause, then
 *    subtract. The interval only exists to trigger re-renders.
 *
 * 2. Backgrounding the app auto-pauses it. If she has answered the door mid-stretch
 *    she is not stretching, and coming back to a routine that has silently run on
 *    without her is worse than useless.
 */

export type Side = 'left' | 'right';

/** How long the "switch sides" announcement stays up before settling down. */
const SWITCH_ANNOUNCE_MS = 6000;

export type TimerState = {
  index: number;
  stretch: Stretch;
  /** Whole seconds left on the current stretch. */
  remainingSec: number;
  /** 0 to 1 through the current stretch. Drives the ring. */
  progress: number;
  /** For bilateral stretches, which side she should be on. Null otherwise. */
  side: Side | null;
  /** True for a few seconds after the swap, so the screen can shout about it. */
  justSwitched: boolean;
  isPaused: boolean;
  isFinished: boolean;
  /** Seconds left in the whole routine, current stretch included. */
  routineRemainingSec: number;
};

type Options = {
  stretches: Stretch[];
  /** Fired when the stretch changes. Good place for a chime. */
  onAdvance?: (next: Stretch, index: number) => void;
  /** Fired at the halfway point of a bilateral stretch. */
  onSwitchSides?: () => void;
  /** Fired once per second over the last few seconds, counting down 5, 4, 3, 2, 1. */
  onCountdown?: (secondsLeft: number) => void;
  onFinish?: () => void;
};

const TICK_MS = 200;
/** How many seconds of run-in warning before a stretch ends. */
const COUNTDOWN_FROM = 5;

export function useRoutineTimer({
  stretches,
  onAdvance,
  onSwitchSides,
  onCountdown,
  onFinish,
}: Options) {
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  // Bumped every tick purely to force a re-render. The real numbers are in refs.
  const [, setTick] = useState(0);

  /** Time banked in the current stretch before the most recent pause. */
  const bankedMs = useRef(0);
  /** When the current unpaused run began. Null while paused. */
  const runningSince = useRef<number | null>(Date.now());
  /** Which side she is on. Left always goes first. */
  const side = useRef<Side>('left');
  /** When the swap happened, so the announcement can time itself out. */
  const switchedAt = useRef<number | null>(null);
  /** Last second we counted down, so the 200ms tick does not fire it five times. */
  const lastCountdown = useRef(0);

  const stretch = stretches[Math.min(index, stretches.length - 1)];

  const elapsedMs = useCallback(() => {
    const live = runningSince.current ? Date.now() - runningSince.current : 0;
    return bankedMs.current + live;
  }, []);

  const resetSegment = useCallback((paused: boolean) => {
    bankedMs.current = 0;
    runningSince.current = paused ? null : Date.now();
    side.current = 'left';
    switchedAt.current = null;
    lastCountdown.current = 0;
  }, []);

  // ------------------------------------------------------------- the tick

  useEffect(() => {
    if (isFinished) return;
    const id = setInterval(() => {
      setTick((t) => t + 1);

      if (runningSince.current === null) return;
      const durationMs = stretch.durationSec * 1000;
      const elapsed = elapsedMs();

      // Halfway through a two-sided stretch, tell her to swap.
      if (stretch.bilateral && side.current === 'left' && elapsed >= durationMs / 2) {
        side.current = 'right';
        switchedAt.current = Date.now();
        onSwitchSides?.();
      }

      // Count her in over the last few seconds so the change never lands cold.
      // Guarded on the second having actually changed, or the 200ms tick would
      // fire each one five times over.
      const secondsLeft = Math.ceil((durationMs - elapsed) / 1000);
      if (secondsLeft >= 1 && secondsLeft <= COUNTDOWN_FROM && secondsLeft !== lastCountdown.current) {
        lastCountdown.current = secondsLeft;
        onCountdown?.(secondsLeft);
      }

      if (elapsed >= durationMs) {
        const next = index + 1;
        if (next >= stretches.length) {
          runningSince.current = null;
          setIsFinished(true);
          onFinish?.();
        } else {
          resetSegment(false);
          setIndex(next);
          onAdvance?.(stretches[next], next);
        }
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [
    index,
    isFinished,
    stretch,
    stretches,
    elapsedMs,
    resetSegment,
    onAdvance,
    onSwitchSides,
    onCountdown,
    onFinish,
  ]);

  // ------------------------------------------- auto-pause when backgrounded

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active' && runningSince.current !== null) {
        bankedMs.current = elapsedMs();
        runningSince.current = null;
        setIsPaused(true);
      }
    });
    return () => sub.remove();
  }, [elapsedMs]);

  // -------------------------------------------------------------- controls

  const pause = useCallback(() => {
    if (runningSince.current === null) return;
    bankedMs.current = elapsedMs();
    runningSince.current = null;
    setIsPaused(true);
  }, [elapsedMs]);

  const resume = useCallback(() => {
    if (runningSince.current !== null || isFinished) return;
    runningSince.current = Date.now();
    setIsPaused(false);
  }, [isFinished]);

  const toggle = useCallback(() => {
    if (runningSince.current === null) resume();
    else pause();
  }, [pause, resume]);

  const skip = useCallback(() => {
    const next = index + 1;
    if (next >= stretches.length) {
      runningSince.current = null;
      setIsFinished(true);
      onFinish?.();
      return;
    }
    resetSegment(isPaused);
    setIndex(next);
    onAdvance?.(stretches[next], next);
  }, [index, stretches, isPaused, resetSegment, onAdvance, onFinish]);

  /**
   * Behaves like the back button on a music player. If she is a few seconds into
   * a stretch, restart it. If she has only just started, go to the previous one.
   */
  const back = useCallback(() => {
    if (elapsedMs() > 3000 || index === 0) {
      resetSegment(isPaused);
      setTick((t) => t + 1);
      return;
    }
    const prev = index - 1;
    resetSegment(isPaused);
    setIndex(prev);
    onAdvance?.(stretches[prev], prev);
  }, [index, isPaused, elapsedMs, resetSegment, onAdvance, stretches]);

  // ---------------------------------------------------------------- output

  const durationMs = stretch.durationSec * 1000;
  const elapsed = Math.min(elapsedMs(), durationMs);
  const remainingSec = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));
  const laterSec = stretches.slice(index + 1).reduce((sum, s) => sum + s.durationSec, 0);

  const state: TimerState = {
    index,
    stretch,
    remainingSec,
    progress: durationMs === 0 ? 0 : elapsed / durationMs,
    side: stretch.bilateral ? side.current : null,
    justSwitched:
      switchedAt.current !== null && Date.now() - switchedAt.current < SWITCH_ANNOUNCE_MS,
    isPaused,
    isFinished,
    routineRemainingSec: remainingSec + laterSec,
  };

  return { ...state, pause, resume, toggle, skip, back, total: stretches.length };
}

/** 185 -> "3:05". Used by the ring and the routine list. */
export function formatTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
