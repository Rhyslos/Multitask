// Right-click context menu for kanban tabs.
//
// Portal'd to document.body to escape clipping and stacking — same pattern
// as the color picker in KanbanTabs. Positioned at the click coordinates,
// with a clamp pass so the menu never falls off the right or bottom edge
// of the viewport.
//
// Closes on the standard triggers: mousedown outside, scroll, resize,
// Escape, and right-click elsewhere (which would just re-open it at a new
// position, so we close the old one first). The parent owns open/close
// state; this component only renders and reports clicks.
//
// IMPORTANT — listener attach timing:
// The very contextmenu event that opens this menu is still bubbling when
// our effect first runs. If we attach the document contextmenu listener
// synchronously inside the effect, it catches the same event that opened
// us and closes the menu immediately. Same risk with mousedown if the
// caller didn't preventDefault. We defer attachment by one frame
// (requestAnimationFrame) so the opening event has finished propagating
// before any close listener is live.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2 } from 'lucide-react';

const MENU_MARGIN = 8;

export default function TabContextMenu({ open, x, y, onDelete, onClose }) {
    const menuRef = useRef(null);
    const [pos, setPos] = useState({ top: y, left: x });

    // event functions
    //
    // Clamp the menu inside the viewport once we know its actual size. We
    // can't compute this before the first paint, so we measure in a layout
    // effect (sync, pre-paint) and update `pos` if needed.
    useLayoutEffect(() => {
        if (!open) return;
        const el = menuRef.current;
        if (!el) return;

        const rect = el.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let nextLeft = x;
        let nextTop = y;
        if (x + rect.width + MENU_MARGIN > vw) nextLeft = vw - rect.width - MENU_MARGIN;
        if (y + rect.height + MENU_MARGIN > vh) nextTop = vh - rect.height - MENU_MARGIN;
        if (nextLeft < MENU_MARGIN) nextLeft = MENU_MARGIN;
        if (nextTop < MENU_MARGIN) nextTop = MENU_MARGIN;

        setPos({ top: nextTop, left: nextLeft });
    }, [open, x, y]);

    // Close triggers. Deferred attach (see comment at top of file) — without
    // this, the contextmenu event that opened the menu catches its own close
    // listener and the menu vanishes in the same frame it appeared.
    useEffect(() => {
        if (!open) return;

        let attached = false;

        function onDocMouseDown(e) {
            if (menuRef.current && menuRef.current.contains(e.target)) return;
            onClose();
        }
        function onScroll() { onClose(); }
        function onResize() { onClose(); }
        function onKey(e) {
            if (e.key === 'Escape') onClose();
        }
        function onContext(e) {
            if (menuRef.current && menuRef.current.contains(e.target)) return;
            onClose();
        }

        const rafId = requestAnimationFrame(() => {
            document.addEventListener('mousedown', onDocMouseDown);
            document.addEventListener('contextmenu', onContext);
            document.addEventListener('keydown', onKey);
            window.addEventListener('scroll', onScroll, true);
            window.addEventListener('resize', onResize);
            attached = true;
        });

        return () => {
            cancelAnimationFrame(rafId);
            if (attached) {
                document.removeEventListener('mousedown', onDocMouseDown);
                document.removeEventListener('contextmenu', onContext);
                document.removeEventListener('keydown', onKey);
                window.removeEventListener('scroll', onScroll, true);
                window.removeEventListener('resize', onResize);
            }
        };
    }, [open, onClose]);

    if (!open) return null;

    return createPortal(
        <div
            ref={menuRef}
            onMouseDown={e => e.stopPropagation()}
            onContextMenu={e => e.preventDefault()}
            style={{
                position: 'fixed',
                top: pos.top,
                left: pos.left,
                minWidth: 160,
                padding: 4,
                background: 'var(--panel, #ffffff)',
                border: '1px solid var(--border, #ddd)',
                borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
                zIndex: 10000,
                userSelect: 'none',
                fontSize: 13,
            }}
        >
            <button
                onClick={onDelete}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 6,
                    color: '#dc2626',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 100ms ease',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(220, 38, 38, 0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
                <Trash2 size={14} strokeWidth={2} />
                Delete tab
            </button>
        </div>,
        document.body
    );
}