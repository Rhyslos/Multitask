// import functions
import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import GraphSubbar from '../components/subbar/GraphSubbar';
import GraphCanvas from '../components/graph/GraphCanvas';
import GraphSidePanel from '../components/graph/GraphSidePanel';
import { buildExecutionOrder, isNodeType } from '../components/graph/GraphHelper';

// component functions
export default function Graph() {
    const { workspaceID } = useParams();
    const [activeMode, setActiveMode] = useState('whiteboard');
    const [activeTool, setActiveTool] = useState('select');

    const [elements, setElements] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [starterId, setStarterId] = useState(null);

    // execution state
    const [isRunning, setIsRunning] = useState(false);
    const [speed, setSpeed] = useState(600);
    const [executionSteps, setExecutionSteps] = useState([]);
    const [stepIndex, setStepIndex] = useState(-1); // -1 = not started; otherwise highest revealed step
    const intervalRef = useRef(null);

    // ids highlighted on the canvas right now (everything up to and including stepIndex)
    const highlightedIds = useMemo(() => {
        const set = new Set();
        if (stepIndex < 0) return set;
        for (let i = 0; i <= stepIndex && i < executionSteps.length; i++) {
            const s = executionSteps[i];
            if (s.kind === 'node' || s.kind === 'edge') set.add(s.id);
        }
        return set;
    }, [executionSteps, stepIndex]);

    // stop execution if mode changes or starter goes missing
    useEffect(() => {
        if (activeMode !== 'dataChart' && isRunning) handleStop();
    }, [activeMode]); // eslint-disable-line react-hooks/exhaustive-deps

    // run the stepper
    useEffect(() => {
        if (!isRunning) return;
        intervalRef.current = setInterval(() => {
            setStepIndex(prev => {
                const next = prev + 1;
                if (next >= executionSteps.length) {
                    clearInterval(intervalRef.current);
                    setIsRunning(false);
                    return prev;
                }
                return next;
            });
        }, speed);
        return () => clearInterval(intervalRef.current);
    }, [isRunning, speed, executionSteps.length]);

    const handlePlay = () => {
        if (!starterId) {
            // soft message — could be replaced with a toast
            alert('Pick a node and click "Set as Starter" first.');
            return;
        }
        const steps = buildExecutionOrder(starterId, elements);
        setExecutionSteps(steps);
        setStepIndex(-1);
        setIsRunning(true);
    };

    const handleStop = () => {
        clearInterval(intervalRef.current);
        setIsRunning(false);
        setStepIndex(-1);
        setExecutionSteps([]);
    };

    const handleSetStarter = () => {
        if (!selectedId) return;
        const el = elements.find(e => e.id === selectedId);
        if (!el || !isNodeType(el.type)) return;
        setStarterId(selectedId);
    };

    const selectedIsNode = useMemo(() => {
        if (!selectedId) return false;
        const el = elements.find(e => e.id === selectedId);
        return el && isNodeType(el.type);
    }, [selectedId, elements]);

    const showSidePanel = activeMode === 'dataChart' && executionSteps.length > 0;

    return (
        <div className="graph-page-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <GraphSubbar
                activeMode={activeMode}
                setActiveMode={setActiveMode}
                activeTool={activeTool}
                setActiveTool={setActiveTool}
                isRunning={isRunning}
                onPlay={handlePlay}
                onStop={handleStop}
                speed={speed}
                setSpeed={setSpeed}
                selectedId={selectedId}
                canSetStarter={selectedIsNode}
                onSetStarter={handleSetStarter}
            />

            <div
                className="canvas-container"
                style={{
                    flex: 1,
                    backgroundColor: '#f8f9fa',
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                }}
            >
                <div style={{ position: 'absolute', top: 20, left: 20, color: '#aaa', zIndex: 10, pointerEvents: 'none' }}>
                    Workspace: {workspaceID} | Mode: {activeMode} | Tool: {activeTool}
                    {starterId && <> | Starter: ✓</>}
                </div>

                <div style={{ flex: 1, position: 'relative' }}>
                    <GraphCanvas
                        activeTool={activeTool}
                        activeMode={activeMode}
                        elements={elements}
                        setElements={setElements}
                        selectedId={selectedId}
                        setSelectedId={setSelectedId}
                        starterId={starterId}
                        highlightedIds={highlightedIds}
                    />
                </div>

                {showSidePanel && (
                    <GraphSidePanel
                        steps={executionSteps}
                        elements={elements}
                        currentIndex={stepIndex}
                        onClose={handleStop}
                    />
                )}
            </div>
        </div>
    );
}