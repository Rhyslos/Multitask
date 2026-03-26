// imports
import { useState, useEffect } from 'react';

// component
export default function WordCountSection({ editor }) {
    // state management
    const [, setForceRender] = useState(0);

    // lifecycle hooks
    useEffect(() => {
        if (!editor) return;

        const handleUpdate = () => {
            setForceRender(prev => prev + 1);
        };

        editor.on('update', handleUpdate);

        return () => {
            editor.off('update', handleUpdate);
        };
    }, [editor]);

    if (!editor) return null;

    // ui rendering
    return (
        <div 
            className="subbar-section notation-word-count" 
            style={{ display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: '13px', color: '#6B7280', userSelect: 'none' }}
        >
            {editor.storage.characterCount.words()} words
        </div>
    );
}