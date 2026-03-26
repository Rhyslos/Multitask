import Subbar from '../subbar/Subbar';
import TipTapToolbar from '../notation/TipTapToolbar';

export default function NotationSubbar({ editor, saved }) {
    return (
        <Subbar className="subbar--notation">
            <TipTapToolbar editor={editor} />
            <div className="notation-save-indicator">
                {saved ? 'Saved' : 'Saving…'}
            </div>
        </Subbar>
    );
}