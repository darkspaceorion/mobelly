import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors } from '@/theme/colors';

/**
 * The ring that empties as the stretch runs, with the pose drawing sitting inside it.
 *
 * Drawn as a stroked circle rotated a quarter turn so it starts at the top, with
 * strokeDashoffset doing the work. No animation library needed: the timer hook
 * re-renders five times a second, which is smooth enough for something this slow
 * and costs nothing in battery.
 */
export function CountdownRing({
  progress,
  size = 280,
  strokeWidth = 10,
  tint = colors.primary,
  children,
}: {
  /** 0 to 1. */
  progress: number;
  size?: number;
  strokeWidth?: number;
  tint?: string;
  /** The pose art. */
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, progress));
  // Full circle at the start, empty at the end.
  const offset = circumference * clamped;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="ringFade" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={tint} stopOpacity="1" />
            <Stop offset="1" stopColor={tint} stopOpacity="0.55" />
          </LinearGradient>
        </Defs>

        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.surfaceSunken}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#ringFade)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          // Start the ring at 12 o'clock rather than 3 o'clock.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // The art sizes itself against the ring diameter, so no padding is needed here.
    // Anything set here would just fight with that calculation.
  },
});
