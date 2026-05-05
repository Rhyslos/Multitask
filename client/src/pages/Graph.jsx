// import functions
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import GraphSubbar from '../components/subbar/GraphSubbar';

// component functions
export default function Graph() {
    const { workspaceID } = useParams();
    const [activeTool, setActiveTool] = useState('select');

    return (
        <div className="graph-page-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <GraphSubbar activeTool={activeTool} setActiveTool={setActiveTool} />
            
            <div 
                className="canvas-container" 
                style={{ 
                    flex: 1, 
                    backgroundColor: '#f8f9fa', 
                    position: 'relative',
                    overflow: 'hidden' 
                }}
            >
                <div style={{ position: 'absolute', top: 20, left: 20, color: '#aaa' }}>
                    Workspace: {workspaceID} | Mode: {activeTool}
                </div>
            </div>
        </div>
    );
}