/**
 * Migrated from extensions/Cindy/apps/desktop/src/renderer/components/ui/switch.tsx
 * Preserves Cindy's exact pointer-drag thumb deformation physics and cindy-switch CSS classes.
 */
import * as React from 'react';
import './switch.css';

const THUMB_SIZE = 16;
const HOVER_WIDTH = 17;
const PRESS_WIDTH = 18;
const PRESS_HEIGHT = 14;
const DRAG_THRESHOLD = 2;

type Gesture = {
  id: number;
  button: HTMLButtonElement;
  startX: number;
  originX: number;
  scale: number;
  maxX: number;
  x: number;
  dragging: boolean;
};

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      className = '',
      disabled,
      checked: controlledChecked,
      defaultChecked = false,
      onCheckedChange,
      onClick,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture,
      onPointerEnter,
      onPointerLeave,
      onKeyDown,
      onKeyUp,
      onBlur,
      ...props
    },
    ref
  ) => {
    const [uncontrolled, setUncontrolled] = React.useState(defaultChecked);
    const isChecked = controlledChecked !== undefined ? controlledChecked : uncontrolled;
    const stateAttr = isChecked ? 'checked' : 'unchecked';

    const thumbRef = React.useRef<HTMLSpanElement>(null);
    const gesture = React.useRef<Gesture | null>(null);
    const suppressPointerClick = React.useRef<(() => void) | null>(null);
    const [hovered, setHovered] = React.useState(false);
    const [pressed, setPressed] = React.useState(false);
    const [dragX, setDragX] = React.useState<number | null>(null);

    const toggle = () => {
      if (disabled) return;
      const next = !isChecked;
      if (controlledChecked === undefined) setUncontrolled(next);
      onCheckedChange?.(next);
    };

    const clearClickSuppression = () => {
      suppressPointerClick.current?.();
      suppressPointerClick.current = null;
    };

    const suppressGestureClick = (button: HTMLButtonElement) => {
      clearClickSuppression();
      const doc = button.ownerDocument;
      doc.addEventListener('pointerdown', clearClickSuppression, { capture: true, once: true });
      suppressPointerClick.current = () =>
        doc.removeEventListener('pointerdown', clearClickSuppression, true);
    };

    const releaseCapture = () => {
      const active = gesture.current;
      gesture.current = null;
      if (active?.button.hasPointerCapture(active.id)) {
        active.button.releasePointerCapture(active.id);
      }
    };

    const cancel = () => {
      if (gesture.current) suppressGestureClick(gesture.current.button);
      releaseCapture();
      setPressed(false);
      setDragX(null);
    };

    React.useEffect(() => {
      if (disabled) {
        cancel();
        setHovered(false);
      }
    }, [disabled]);

    React.useEffect(
      () => () => {
        releaseCapture();
        clearClickSuppression();
      },
      []
    );

    const thumbWidth =
      !disabled && pressed ? PRESS_WIDTH : !disabled && hovered ? HOVER_WIDTH : THUMB_SIZE;
    const thumbHeight = !disabled && pressed ? PRESS_HEIGHT : THUMB_SIZE;
    const thumbStyle = {
      '--switch-thumb-width': `${thumbWidth / THUMB_SIZE}rem`,
      '--switch-thumb-height': `${thumbHeight / THUMB_SIZE}rem`,
      ...(dragX !== null && !disabled ? { '--switch-drag-x': `${dragX}px` } : {}),
    } as React.CSSProperties;

    return (
      <button
        {...props}
        ref={ref}
        type="button"
        role="switch"
        aria-checked={isChecked}
        data-state={stateAttr}
        data-disabled={disabled ? '' : undefined}
        disabled={disabled}
        className={`cindy-switch peer relative inline-flex h-5 w-9 shrink-0 cursor-pointer touch-pan-y select-none items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 ${
          isChecked ? 'bg-[#3b6df6]' : 'bg-border-default/80'
        } ${className}`}
        onClick={(event) => {
          if (suppressPointerClick.current && event.detail > 0) {
            clearClickSuppression();
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          onClick?.(event);
          if (!event.defaultPrevented) toggle();
        }}
        onPointerEnter={(event) => {
          onPointerEnter?.(event);
          if (!event.defaultPrevented && !disabled && event.pointerType === 'mouse')
            setHovered(true);
        }}
        onPointerLeave={(event) => {
          onPointerLeave?.(event);
          setHovered(false);
        }}
        onPointerDown={(event) => {
          onPointerDown?.(event);
          if (
            event.defaultPrevented ||
            disabled ||
            event.button !== 0 ||
            !event.isPrimary ||
            gesture.current
          )
            return;
          const button = event.currentTarget;
          const thumb = thumbRef.current;
          if (!thumb) return;
          const bounds = button.getBoundingClientRect();
          const scale = bounds.width / button.offsetWidth || 1;
          const rem = parseFloat(getComputedStyle(button.ownerDocument.documentElement).fontSize);
          const maxX = Math.max(0, button.clientWidth - (PRESS_WIDTH / THUMB_SIZE) * rem);
          const originX = Math.max(
            0,
            Math.min(
              maxX,
              (thumb.getBoundingClientRect().left - bounds.left) / scale - button.clientLeft
            )
          );
          clearClickSuppression();
          gesture.current = {
            id: event.pointerId,
            button,
            startX: event.clientX,
            originX,
            scale,
            maxX,
            x: originX,
            dragging: false,
          };
          button.setPointerCapture(event.pointerId);
          setPressed(true);
        }}
        onPointerMove={(event) => {
          onPointerMove?.(event);
          const active = gesture.current;
          if (event.defaultPrevented || !active || active.id !== event.pointerId) return;
          const delta = (event.clientX - active.startX) / active.scale;
          if (!active.dragging && Math.abs(delta) < DRAG_THRESHOLD) return;
          active.dragging = true;
          active.x = Math.max(0, Math.min(active.maxX, active.originX + delta));
          setDragX(active.x);
        }}
        onPointerUp={(event) => {
          onPointerUp?.(event);
          const active = gesture.current;
          if (!active || active.id !== event.pointerId) return;
          releaseCapture();
          setPressed(false);
          setDragX(null);
          if (event.pointerType !== 'mouse') setHovered(false);
          if (active.dragging) {
            suppressGestureClick(active.button);
            const next = active.x > active.maxX / 2;
            if (!event.defaultPrevented && !disabled && next !== isChecked) {
              toggle();
            }
          }
        }}
        onPointerCancel={(event) => {
          onPointerCancel?.(event);
          if (gesture.current?.id === event.pointerId) {
            cancel();
            setHovered(false);
          }
        }}
        onLostPointerCapture={(event) => {
          onLostPointerCapture?.(event);
          if (gesture.current?.id === event.pointerId) cancel();
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented || disabled) return;
          if (event.key === ' ' || event.key === 'Enter') setPressed(true);
          if (event.key === 'Escape') cancel();
        }}
        onKeyUp={(event) => {
          onKeyUp?.(event);
          if (event.key === ' ' || event.key === 'Enter') setPressed(false);
        }}
        onBlur={(event) => {
          onBlur?.(event);
          cancel();
        }}
      >
        <span
          ref={thumbRef}
          style={thumbStyle}
          data-state={stateAttr}
          data-disabled={disabled ? '' : undefined}
          data-dragging={dragX !== null && !disabled ? '' : undefined}
          className="cindy-switch-thumb pointer-events-none block shrink-0 rounded-full bg-white shadow-2xs ring-0"
        />
      </button>
    );
  }
);
Switch.displayName = 'Switch';
