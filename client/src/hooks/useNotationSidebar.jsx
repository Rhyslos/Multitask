import { useState, useEffect } from 'react';
import { useSync } from './useSync';

export function useNotationSidebar(workspaceID) {
    const { sm } = useSync();
    const [groups, setGroups] = useState([]);
    const [pages, setPages] = useState([]);
    const [loading, setLoading] = useState(true);

    return { groups, pages, loading};
}