import { useState, useCallback } from 'react';


// Hook
export function useAnimatedRemoval(onRemove, duration = 250) {
    const [removingIds, setRemovingIds] = useState(new Set());

    const triggerRemoval = useCallback((id) => {
        setRemovingIds(prev => new Set([...prev, id]));
        setTimeout(() => {
            setRemovingIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            onRemove(id);
        }, duration);
    }, [onRemove, duration]);

    const isRemoving = useCallback((id) => removingIds.has(id), [removingIds]);

    return { triggerRemoval, isRemoving };
}