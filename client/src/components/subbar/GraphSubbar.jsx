// import functions
import Subbar from './Subbar';
import {
    Hand,
    MousePointer2,
    Square,
    Circle,
    ArrowRight,
    Minus,
    Eraser,
    Type,
    Play,
    StopCircle,
    Flag,
} from 'lucide-react';

// component functions
export default function GraphSubbar({
    activeTool,
    setActiveTool,
    isRunning,
    onPlay,
    onStop,
    speed,
    setSpeed,
    selectedId,
    canSetStarter,
    onSetStarter,
}) {
    const tools = [
        { id: 'hand',      Icon: Hand,          label: 'Pan' },
        { id: 'select',    Icon: MousePointer2, label: 'Select' },
        { id: 'rectangle', Icon: Square,        label: 'Rectangle' },
        { id: 'circle',    Icon: Circle,        label: 'Circle' },
        { id: 'arrow',     Icon: ArrowRight,    label: 'Arrow' },
        { id: 'line',      Icon: Minus,         label: 'Line' },
        { id: 'text',      Icon: Type,          label: 'Text' },
        { id: 'eraser',    Icon: Eraser,        label: 'Eraser' },
    ];

    return (
        <Subbar>
            <div style={{ display: 'flex', flexDirection: 'row', width: '100%', gap: '32px' }}>

                <div className="subbar-section">
                    <span className="subbar-label" style={{ textTransform: 'uppercase' }}>Tools</span>
                    <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', marginTop: '8px' }}>
                        {tools.map((tool) => {
                            const isActive = activeTool === tool.id;
                            return (
                                <button
                                    key={tool.id}
                                    onClick={() => setActiveTool(tool.id)}
                                    title={tool.label}
                                    style={{
                                        padding: '6px 10px',
                                        background: isActive ? 'var(--accent)' : 'transparent',
                                        color:      isActive ? 'white'         : 'var(--ink)',
                                        border:     isActive ? 'none'          : '1px solid var(--border)',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <tool.Icon size={16} />
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="subbar-section" style={{ borderLeft: '1px solid var(--border)', paddingLeft: '32px', flex: 1 }}>
                    <span className="subbar-label" style={{ textTransform: 'uppercase' }}>Trace</span>
                    <div style={{ marginTop: '8px' }}>
                        <TraceControls
                            isRunning={isRunning}
                            onPlay={onPlay}
                            onStop={onStop}
                            speed={speed}
                            setSpeed={setSpeed}
                            selectedId={selectedId}
                            canSetStarter={canSetStarter}
                            onSetStarter={onSetStarter}
                        />
                    </div>
                </div>

            </div>
        </Subbar>
    );
}

function TraceControls({ isRunning, onPlay, onStop, speed, setSpeed, selectedId, canSetStarter, onSetStarter }) {
    const btn = (active) => ({
        padding: '6px 10px',
        background: active ? 'var(--accent)' : 'transparent',
        color:      active ? 'white'         : 'var(--ink)',
        border:     active ? 'none'          : '1px solid var(--border)',
        borderRadius: '6px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '13px',
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'row', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {!isRunning ? (
                <button onClick={onPlay} title="Run a trace from the starter node" style={btn(false)}>
                    <Play size={14} /> Run Trace
                </button>
            ) : (
                <button onClick={onStop} title="Stop" style={btn(true)}>
                    <StopCircle size={14} /> Stop
                </button>
            )}

            <button
                onClick={onSetStarter}
                disabled={!canSetStarter}
                title={canSetStarter ? 'Mark selected node as starter' : 'Select a node first'}
                style={{
                    ...btn(false),
                    opacity: canSetStarter ? 1 : 0.5,
                    cursor: canSetStarter ? 'pointer' : 'not-allowed',
                }}
            >
                <Flag size={14} /> Set as Starter
            </button>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--muted)' }}>
                Speed
                <input
                    type="range"
                    min="100"
                    max="2000"
                    step="100"
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    style={{ width: '120px' }}
                />
                <span style={{ minWidth: '48px' }}>{speed}ms</span>
            </label>
        </div>
    );
}