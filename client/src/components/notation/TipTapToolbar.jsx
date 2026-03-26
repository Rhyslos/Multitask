import { useRef, useEffect } from 'react';
import HistorySection from './toolbar/HistorySection';
import StyleSection from './toolbar/StyleSection';
import FormattingSection from './toolbar/FormattingSection';
import ListSection from './toolbar/ListSection';
import AlignmentSection from './toolbar/AlignmentSection';
import ColorLinkSection from './toolbar/ColorLinkSection';

export default function TipTapToolbar({ editor }) {
    const toolbarRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (toolbarRef.current && !toolbarRef.current.contains(event.target)) {
                // ColorLinkSection manages its own picker state locally
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (!editor) return null;

    return (
        <div className="tiptap-toolbar" ref={toolbarRef}>
            <HistorySection    editor={editor} />
            <StyleSection      editor={editor} />
            <FormattingSection editor={editor} />
            <ListSection       editor={editor} />
            <AlignmentSection  editor={editor} />
            <ColorLinkSection  editor={editor} />
        </div>
    );
}