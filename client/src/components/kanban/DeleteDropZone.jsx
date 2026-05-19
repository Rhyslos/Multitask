// initialization functions
import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';

// Drag-to-delete dropzone.
//
// Renders only while a drag is active. Visually a hovering bar near the
// bottom of the viewport: grey by default, red when the cursor is over it.
// The hit-test itself lives in useDragDrop — this component just registers
// its DOM node and renders the visual state.
//
// pointerEvents is 'none' deliberately: useDragDrop reads the rect via
// getBoundingClientRect, so we don't need real pointer events here, and
// leaving them enabled would let the bar eat clicks on whatever's below
// when no drag is active.
//
// zIndex is 1001 — one above the drag clone (1000) — so the clone passes
// UNDER the bar at the moment of release, which reads as "consumed."
//
// Animation notes:
//   - `mounted` state separates "added to DOM" from "visible", so the entry
//     transition (slide up + fade in) actually runs. Without this, the bar
//     would pop in fully-styled because React commits the final styles in
//     the same frame as the mount.
//   - cubic-bezier(0.32, 0.72, 0, 1) is a smooth deceleration curve — eases
//     out more gradually than the default `ease`, which makes the entry
//     feel like it's settling rather than snapping.
//   - The grey→red transition runs at 200ms; long enough to read as a
//     deliberate state shift, short enough to feel responsive to the
//     cursor entering the zone.

// ui components
export default function DeleteDropZone({ visible, isOver, registerDeleteZone }) {
    const [mounted, setMounted] = useState(false);

    // event functions
    //
    // Two-frame mount: render at visible=false, then in the next frame flip
    // to visible=true so the CSS transition actually runs. requestAnimationFrame
    // alone isn't always enough — the browser can batch the style change into
    // the same paint — so we double-RAF to guarantee a paint between states.
    useEffect(() => {
        if (!visible) {
            setMounted(false);
            return;
        }
        const id1 = requestAnimationFrame(() => {
            const id2 = requestAnimationFrame(() => setMounted(true));
            return () => cancelAnimationFrame(id2);
        });
        return () => cancelAnimationFrame(id1);
    }, [visible]);

    if (!visible) return null;

    // Springy ease for the entry and the hover-scale. Decelerates smoothly
    // into the resting state instead of arriving abruptly.
    const ease = 'cubic-bezier(0.32, 0.72, 0, 1)';

    const baseTransform = 'translateX(-50%)';
    const restingTransform = mounted
        ? `${baseTransform} translateY(0) scale(${isOver ? 1.05 : 1})`
        : `${baseTransform} translateY(16px) scale(0.96)`;

    return (
        <div
            ref={registerDeleteZone}
            style={{
                position: 'fixed',
                left: '50%',
                bottom: 24,
                transform: restingTransform,
                opacity: mounted ? 1 : 0,
                width: 'min(480px, 60vw)',
                height: 72,
                borderRadius: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: '0.01em',
                color: isOver ? '#fff' : 'rgba(255, 255, 255, 0.88)',
                background: isOver ? 'rgba(220, 38, 38, 0.94)' : 'rgba(50, 50, 55, 0.78)',
                border: `2px dashed ${isOver ? 'rgba(255, 255, 255, 0.65)' : 'rgba(255, 255, 255, 0.22)'}`,
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                boxShadow: isOver
                    ? '0 12px 32px rgba(220, 38, 38, 0.5), 0 0 0 4px rgba(220, 38, 38, 0.15)'
                    : '0 8px 24px rgba(0, 0, 0, 0.28)',
                transition: [
                    `transform 280ms ${ease}`,
                    `opacity 220ms ${ease}`,
                    `background 220ms ${ease}`,
                    `color 220ms ${ease}`,
                    `border-color 220ms ${ease}`,
                    `box-shadow 220ms ${ease}`,
                ].join(', '),
                pointerEvents: 'none',
                zIndex: 1001,
                userSelect: 'none',
            }}
        >
            <Trash2
                size={20}
                strokeWidth={2}
                style={{
                    transform: isOver ? 'rotate(-12deg) scale(1.1)' : 'rotate(0deg) scale(1)',
                    transition: `transform 260ms ${ease}`,
                }}
            />
            <span
                style={{
                    transition: `opacity 180ms ${ease}`,
                }}
            >
                {isOver ? 'Release to delete' : 'Drag here to delete'}
            </span>
        </div>
    );
}