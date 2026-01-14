export interface Snapshot {
    id: string;
    timestamp: number;
    filePath: string; // Relative to workspace root
    eventType: 'save' | 'rename' | 'delete' | 'label' | 'manual';
    storagePath?: string; // Filename in the storage directory
    label?: string;
    description?: string;
}

export interface HistoryEntry extends Snapshot {
    // Extended properties for UI if needed
    displayDate?: string;
}

export interface HistoryIndex {
    snapshots: Snapshot[];
}

export interface LocalHistoryConfig {
    enabled: boolean;
    maxDays: number;
    maxSizeMB: number;
    trackSelectionHistory: boolean;
    exclude: string[];
}

export interface GitHistoryConfig {
    maxCommits: number;
    followRenames: boolean;
    dateFormat: string;
}

export interface GitCommit {
    hash: string;
    author: string;
    date: string;
    message: string;
    diff: string;
}