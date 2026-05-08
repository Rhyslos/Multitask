// Bottom-right overlay: live zoom percentage + reset-view button.
export default function ZoomBadge({ zoom, onReset }) {
    const baseBtn = {
        background: 'rgba(255,255,255,0.92)',
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: '6px',
        padding: '6px 10px',
        fontSize: '12px',
        color: 'var(--ink, #1e1e1e)',
        cursor: 'pointer',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        userSelect: 'none',
    };

    return (
        <div
            style={{
                position: 'absolute',
                bottom: '16px',
                right: '16px',
                display: 'flex',
                gap: '8px',
                zIndex: 30,
            }}
        >
            <div style={{ ...baseBtn, cursor: 'default', minWidth: '52px', justifyContent: 'center' }}>
                {Math.round(zoom * 100)}%
            </div>
            <button onClick={onReset} title="Reset view (100% zoom, centered)" style={baseBtn}>
                Reset view
            </button>
        </div>
    );
}