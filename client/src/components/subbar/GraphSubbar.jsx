// import functions
import Subbar from './Subbar';

// component functions
export default function GraphSubbar({ activeTool, setActiveTool }) {
    const tools = [
        { id: 'select', icon: '↖️', label: 'Select' },
        { id: 'rectangle', icon: '⬜', label: 'Rectangle' },
        { id: 'circle', icon: '⭕', label: 'Circle' },
        { id: 'arrow', icon: '↗️', label: 'Arrow' },
        { id: 'text', icon: 'T', label: 'Text' },
    ];

    return (
        <Subbar>
            <div className="subbar-section" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span className="subbar-label" style={{ marginRight: '8px' }}>Tools</span>
                
                {tools.map((tool) => (
                    <button
                        key={tool.id}
                        onClick={() => setActiveTool(tool.id)}
                        title={tool.label}
                        style={{
                            padding: '6px 12px',
                            background: activeTool === tool.id ? 'var(--accent)' : 'transparent',
                            color: activeTool === tool.id ? 'white' : 'var(--ink)',
                            border: activeTool === tool.id ? 'none' : '1px solid var(--border)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '14px'
                        }}
                    >
                        {tool.icon}
                    </button>
                ))}
            </div>

            <div className="subbar-section">
                <span className="subbar-label">Options</span>
                <div className="subbar-placeholder">
                    {activeTool === 'text' ? 'Font Settings...' : 'Stroke & Fill...'}
                </div>
            </div>
        </Subbar>
    );
}