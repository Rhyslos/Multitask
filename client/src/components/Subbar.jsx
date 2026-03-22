import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import KanbanTabs from './kanban/KanbanTabs';

// Component
export default function Subbar({ tabs, activeTabId, onTabSelect, onTabAdd, onTabUpdate, onTabArchive }) {
    const [collapsed, setCollapsed] = useState(false);
    const location = useLocation();

    const isKanban = location.pathname.includes('/kanban');

    if (isKanban) {
        return (
            <div className="subbar subbar--kanban">
                <KanbanTabs
                    tabs={tabs ?? []}
                    activeTabId={activeTabId}
                    onSelect={onTabSelect}
                    onAdd={onTabAdd}
                    onUpdate={onTabUpdate}
                    onArchive={onTabArchive}
                />
            </div>
        );
    }

    return (
        <div className="subbar">
            <div className="subbar-section">
                <span className="subbar-label">Recent</span>
                <div className="subbar-placeholder">No recent workspaces</div>
            </div>
            <div className="subbar-section">
                <span className="subbar-label">Deadlines</span>
                <div className="subbar-placeholder">No upcoming deadlines</div>
            </div>
            <div className="subbar-section">
                <span className="subbar-label">Activity</span>
                <div className="subbar-placeholder">No recent activity</div>
            </div>

            <button
                className="subbar-collapse-btn"
                onClick={() => setCollapsed(o => !o)}
            >
                {collapsed ? '▲ Hide' : '☰ Overview'}
            </button>

            {collapsed && (
                <div className="subbar-collapsed-dropdown">
                    <div className="subbar-collapsed-section">
                        <span className="subbar-label">Recent</span>
                        <div className="subbar-placeholder">No recent workspaces</div>
                    </div>
                    <div className="subbar-collapsed-section">
                        <span className="subbar-label">Deadlines</span>
                        <div className="subbar-placeholder">No upcoming deadlines</div>
                    </div>
                    <div className="subbar-collapsed-section">
                        <span className="subbar-label">Activity</span>
                        <div className="subbar-placeholder">No recent activity</div>
                    </div>
                </div>
            )}
        </div>
    );
}