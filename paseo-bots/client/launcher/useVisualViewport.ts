/**
 * Purpose: Visual viewport and virtual keyboard detection hook for mobile bottom sheets.
 * Context: Re-exports shared visualViewport tracking from client/keyboard.ts to prevent duplication.
 * Usage: const { keyboardHeight, viewportHeight } = useVisualViewport();
 * Prerequisites: Web and React Native environments.
 */

export { useVisualViewport, type ViewportState } from "../keyboard";
