/**
 * Purpose: Light tactile haptic feedback utility for mobile touch interactions.
 * Context: Matches pi-web mobile responsiveness standards with zero-dependency browser API fallback.
 * Usage: import { triggerHaptic } from '@/utils/haptics'; triggerHaptic('light');
 * Prerequisites: Modern mobile browser supporting navigator.vibrate.
 */

export type HapticStyle = 'light' | 'medium' | 'success' | 'warning';

export function triggerHaptic(style: HapticStyle = 'light'): void {
  if (typeof window === 'undefined' || !('vibrate' in navigator)) {
    return;
  }

  try {
    switch (style) {
      case 'light':
        navigator.vibrate(8);
        break;
      case 'medium':
        navigator.vibrate(18);
        break;
      case 'success':
        navigator.vibrate([10, 40, 15]);
        break;
      case 'warning':
        navigator.vibrate([20, 50, 20]);
        break;
    }
  } catch {
    // Graceful no-op on non-supported environments
  }
}
