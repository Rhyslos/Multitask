import Subbar from './Subbar';
import TipTapToolbar from '../notation/TipTapToolbar';

// Component
export default function NotationSubbar({ editor, saved }) {
    if (!editor) {
        return null;
    }

    return (
        <Subbar className="subbar--notation">
            <TipTapToolbar editor={editor} />
            <div className="notation-save-indicator">
                {saved ? 'Saved' : 'Saving…'}
            </div>
        </Subbar>
    );
}