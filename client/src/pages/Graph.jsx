// imports
import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import GraphSubbar from '../components/subbar/GraphSubbar';
import GraphCanvas from '../components/graph/GraphCanvas';
import GraphSidePanel from '../components/graph/GraphSidePanel';
import { buildExecutionOrder, isNodeType } from '../components/graph/GraphHelper';
import useGraphSync from '../hooks/useGraphSync';
import useElementsView from '../hooks/useElementsView';
import useLocalOverrides, { applyOverrides } from '../hooks/useLocalOverrides';
import useAwareness from '../hooks/useAwareness';
import { makeGraphMutator } from '../components/graph/graphMutator';

// page component
export default function Graph() {
    const { workspaceID } = useParams();
    const { user } = useAuth();
    const [activeTool, setActiveTool] = useState('select');

    const { doc, yElements, awareness, connected, clientId } = useGraphSync(workspaceID, user);
    const ySnapshot = useElementsView(yElements);
    const { overrides, localState } = useLocalOverrides();
    const elements = useMemo(() => applyOverrides(ySnapshot, overrides), [ySnapshot, overrides]);

    const mutator = useMemo(() => {
        if (!doc || !yElements) return null;
        return makeGraphMutator(doc, yElements, localState);
    }, [doc, yElements, localState]);

    const { peers, broadcastCursor, broadcastSelection } = useAwareness(awareness, clientId);

    const [clipboard, setClipboard] = useState(null);

    // selection state
    const [selectedIds, setSelectedIdsRaw] = useState(() => new Set());

    const setSelectedId = useMemo(() => (next) => {
        setSelectedIdsRaw(prev => {
            let nextSet;
            if (typeof next === 'function') {
                const result = next(prev);
                nextSet = result instanceof Set ? result : toSet(result);
            } else {
                nextSet = toSet(next);
            }
            
            const first = nextSet.size > 0 ? nextSet.values().next().value : null;
            broadcastSelection(first);
            return nextSet;
        });
    }, [broadcastSelection]);

    const selectedId = useMemo(() => {
        if (selectedIds.size === 0) return null;
        
        let last = null;
        for (const id of selectedIds) last = id;
        return last;
    }, [selectedIds]);

    const [starterId, setStarterId] = useState(null);

    // trace state
    const [isRunning, setIsRunning] = useState(false);
    const [speed, setSpeed] = useState(600);
    const [executionSteps, setExecutionSteps] = useState([]);
    const [stepIndex, setStepIndex] = useState(-1);
    const intervalRef = useRef(null);

    const highlightedIds = useMemo(() => {
        const set = new Set();
        if (stepIndex < 0) return set;
        for (let i = 0; i <= stepIndex && i < executionSteps.length; i++) {
            const s = executionSteps[i];
            if (s.kind === 'node' || s.kind === 'edge') set.add(s.id);
        }
        return set;
    }, [executionSteps, stepIndex]);

    // effect handlers
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

    // event handlers
    const handlePlay = () => {
        if (!starterId) {
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

    const showSidePanel = executionSteps.length > 0;

    return (
        <div className="graph-page-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <GraphSubbar
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
                    Workspace: {workspaceID} | Tool: {activeTool}
                    {starterId && <> | Starter: ✓</>}
                    {selectedIds.size > 1 && <> | {selectedIds.size} selected</>}
                    {' | '}
                    <span style={{ color: connected ? '#10b981' : '#ef4444' }}>
                        {connected ? '● live' : '● offline'}
                    </span>
                </div>

                <div style={{ flex: 1, position: 'relative' }}>
                    {mutator && (
                        <GraphCanvas
                            activeTool={activeTool}
                            elements={elements}
                            mutator={mutator}
                            selectedId={selectedId}
                            selectedIds={selectedIds}
                            setSelectedId={setSelectedId}
                            starterId={starterId}
                            highlightedIds={highlightedIds}
                            peers={peers}
                            broadcastCursor={broadcastCursor}
                            clipboard={clipboard}
                            setClipboard={setClipboard}
                        />
                    )}
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

// utility functions
function toSet(input) {
    if (input == null) return new Set();
    if (input instanceof Set) return new Set(input);
    if (Array.isArray(input)) return new Set(input.filter(Boolean));
    if (typeof input === 'string') return new Set([input]);
    return new Set();
}