import Subbar from './Subbar';
import KanbanTabs from '../kanban/KanbanTabs';

// Component
export default function KanbanSubbar({ tabs, activeTabId, onTabSelect, onTabAdd, onTabUpdate, onTabArchive }) {
    return (
        <Subbar className="subbar--kanban">
            <KanbanTabs
                tabs={tabs ?? []}
                activeTabId={activeTabId}
                onSelect={onTabSelect}
                onAdd={onTabAdd}
                onUpdate={onTabUpdate}
                onArchive={onTabArchive}
            />
        </Subbar>
    );
}