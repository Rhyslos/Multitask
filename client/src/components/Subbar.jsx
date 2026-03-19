// Component
export default function Subbar({ children }) {
    return (
        <div className="subbar">
            {children || (
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
                </>
            )}
        </div>
    );
}