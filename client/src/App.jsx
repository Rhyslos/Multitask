import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

// UI component functions
export default function App() {
    
    // State management functions
    const editor = useEditor({
        extensions: [
            StarterKit,
        ],
        content: '<p>Start typing your task description here...</p>',
    });

    // Render functions
    return (
        <div style={{ maxWidth: '600px', margin: '40px auto', fontFamily: 'sans-serif' }}>
            <h2>Task Editor</h2>
            
            <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '4px', minHeight: '150px' }}>
                <EditorContent editor={editor} />
            </div>
        </div>
    );
}