import { useState } from 'react';


// Component
export default function Subbar({ children }) {
    const [collapsed, setCollapsed] = useState(false);

    return (
        <div className="subbar">
            {children ? children : (
                <>
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
                </>
            )}
        </div>
    );
}