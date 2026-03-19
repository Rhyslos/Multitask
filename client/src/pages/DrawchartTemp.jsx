import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { useNavigate, useParams } from 'react-router-dom';


// TEMP FILE - DELETE AFTER SHOWCASE
export default function DrawchartTemp() {
    const navigate = useNavigate();
    const { workspaceID } = useParams();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <nav style={{
                height: '52px',
                background: '#faf8f5',
                borderBottom: '1px solid #e2ddd8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 24px',
                flexShrink: 0,
                position: 'relative',
            }}>
                <div
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                    onClick={() => navigate('/dashboard')}
                >
                    <span style={{ color: '#c8502a', fontSize: '16px' }}>✦</span>
                    <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: '16px' }}>StudySpace</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
                    <button
                        onClick={() => navigate(`/workspace/${workspaceID}/graph`)}
                        style={navBtnStyle(true)}
                    >
                        Graph Editor
                    </button>
                    <button
                        onClick={() => navigate(`/workspace/${workspaceID}/kanban`)}
                        style={navBtnStyle(false)}
                    >
                        Kanban
                    </button>
                    <button
                        onClick={() => navigate(`/workspace/${workspaceID}/notation`)}
                        style={navBtnStyle(false)}
                    >
                        Notation
                    </button>
                </div>
            </nav>

            <div style={{ flex: 1 }}>
                <Excalidraw />
            </div>
        </div>
    );
}


// Styles
function navBtnStyle(active) {
    return {
        background: active ? '#f0e0d8' : 'none',
        border: 'none',
        fontFamily: 'Noto Sans, sans-serif',
        fontSize: '13px',
        fontWeight: '500',
        color: active ? '#c8502a' : '#8a857e',
        cursor: 'pointer',
        padding: '6px 14px',
        borderRadius: '8px',
    };
}