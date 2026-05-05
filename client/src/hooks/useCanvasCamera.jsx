// Camera hook — manages canvas pan/zoom and the wheel listener.
// Exposes: { camera, setCamera, screenToWorld, resetView }
// camera shape: { x, y, zoom }

import { useState, useEffect, useCallback, useRef } from 'react';

export default function useCanvasCamera(canvasRef) {
    const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });

    // Keep a ref of the latest camera so the wheel listener (registered once)
    // always reads current values. setCamera(prev => ...) handles this for writes;
    // the ref is only needed for cursor-anchored zoom math reading clientX rect.
    const cameraRef = useRef(camera);
    cameraRef.current = camera;

    const screenToWorld = useCallback((sx, sy) => {
        const c = cameraRef.current;
        return { x: (sx - c.x) / c.zoom, y: (sy - c.y) / c.zoom };
    }, []);

    const resetView = useCallback(() => setCamera({ x: 0, y: 0, zoom: 1 }), []);

    // Non-passive wheel listener so preventDefault works.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleWheel = (e) => {
            e.preventDefault();

            // Decision tree for pan vs zoom:
            //   ctrlKey/metaKey  → zoom (Mac trackpad pinch sets ctrlKey; Cmd/Ctrl+wheel)
            //   has horizontal delta → pan (only trackpads produce deltaX)
            //   |deltaY| >= 50 with deltaMode 0 → mouse wheel → zoom
            //   otherwise → trackpad vertical → pan
            const isPinch = e.ctrlKey || e.metaKey;
            let mode;
            if (isPinch)                                          mode = 'zoom';
            else if (e.deltaX !== 0)                              mode = 'pan';
            else if (e.deltaMode === 0 && Math.abs(e.deltaY) >= 50) mode = 'zoom';
            else                                                  mode = 'pan';

            const rect = canvas.getBoundingClientRect();
            const cursorX = e.clientX - rect.left;
            const cursorY = e.clientY - rect.top;

            if (mode === 'pan') {
                setCamera(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
                return;
            }

            // Zoom toward cursor: keep the world point under the cursor fixed.
            setCamera(prev => {
                const ZOOM_SPEED = 0.0015;
                const factor = Math.exp(-e.deltaY * ZOOM_SPEED);
                const nextZoom = Math.max(0.1, Math.min(5, prev.zoom * factor));
                if (nextZoom === prev.zoom) return prev;
                const wx = (cursorX - prev.x) / prev.zoom;
                const wy = (cursorY - prev.y) / prev.zoom;
                return { x: cursorX - wx * nextZoom, y: cursorY - wy * nextZoom, zoom: nextZoom };
            });
        };

        canvas.addEventListener('wheel', handleWheel, { passive: false });
        return () => canvas.removeEventListener('wheel', handleWheel);
    }, [canvasRef]);

    return { camera, setCamera, screenToWorld, resetView };
}