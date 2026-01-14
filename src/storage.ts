import * as vscode from 'vscode';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Snapshot, HistoryIndex, LocalHistoryConfig } from './types';

export class HistoryStorage {
    private globalStorageRoot: vscode.Uri;
    private indices: Map<string, HistoryIndex> = new Map();
    private initialized = false;
    private saveQueue: Promise<void> = Promise.resolve();

    constructor(private context: vscode.ExtensionContext) {
        this.globalStorageRoot = context.storageUri || context.globalStorageUri;
    }

    async init(): Promise<void> {
        if (this.initialized) return;
        
        try {
            await vscode.workspace.fs.createDirectory(this.globalStorageRoot);
            this.initialized = true;
            console.log('[HistoryStorage] Initialized');
        } catch (e) {
            console.error('[HistoryStorage] Global init failed:', e);
        }
    }

    private async getStorageForFile(fileUri: vscode.Uri): Promise<{ root: vscode.Uri, indexUri: vscode.Uri }> {
        const config = vscode.workspace.getConfiguration('localHistory');
        const saveInProject = config.get<boolean>('saveInProjectFolder', false);
        
        let root = this.globalStorageRoot;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
        
        if (saveInProject && workspaceFolder) {
            root = vscode.Uri.joinPath(workspaceFolder.uri, '.history');
        }

        return {
            root,
            indexUri: vscode.Uri.joinPath(root, 'index.json')
        };
    }

    private async loadIndex(indexUri: vscode.Uri): Promise<HistoryIndex> {
        const key = indexUri.toString();
        if (this.indices.has(key)) return this.indices.get(key)!;

        try {
            const data = await vscode.workspace.fs.readFile(indexUri);
            const decoded = new TextDecoder().decode(data);
            const index = JSON.parse(decoded);
            this.indices.set(key, index);
            return index;
        } catch (e) {
            const newIndex = { snapshots: [] };
            this.indices.set(key, newIndex);
            return newIndex;
        }
    }

    async saveSnapshot(
        document: vscode.TextDocument, 
        eventType: Snapshot['eventType'], 
        label?: string, 
        description?: string
    ): Promise<Snapshot | null> {
        await this.init();
        
        const { root, indexUri } = await this.getStorageForFile(document.uri);
        const index = await this.loadIndex(indexUri);
        const relativePath = vscode.workspace.asRelativePath(document.uri, false);

        const currentContent = document.getText();

        // Optimization: Don't save if content is identical to last snapshot
        const lastSnapshot = [...index.snapshots]
            .filter(s => s.filePath === relativePath)
            .sort((a, b) => b.timestamp - a.timestamp)[0];

        if (lastSnapshot && lastSnapshot.storagePath) {
            try {
                const lastUri = vscode.Uri.joinPath(root, lastSnapshot.storagePath);
                const lastData = await vscode.workspace.fs.readFile(lastUri);
                const lastContent = new TextDecoder().decode(lastData);
                
                if (lastContent === currentContent) {
                    console.log('[HistoryStorage] Content identical to last snapshot, skipping save.');
                    return null;
                }
            } catch (e) {
                // If we can't read last snapshot, proceed with saving new one
            }
        }

        const id = uuidv4();
        const blobUri = vscode.Uri.joinPath(root, id);

        try {
            await vscode.workspace.fs.createDirectory(root);
            const content = new TextEncoder().encode(currentContent);
            await vscode.workspace.fs.writeFile(blobUri, content);
        } catch (e) {
            console.error('[HistoryStorage] Save failed:', e);
            return null;
        }

        const snapshot: Snapshot = {
            id,
            timestamp: Date.now(),
            filePath: relativePath,
            eventType,
            storagePath: id,
            label,
            description
        };

        index.snapshots.push(snapshot);
        await this.saveIndex(index, indexUri);
        
        return snapshot;
    }

    async getHistoryForFile(fileUri: vscode.Uri): Promise<Snapshot[]> {
        await this.init();
        
        const { indexUri } = await this.getStorageForFile(fileUri);
        const index = await this.loadIndex(indexUri);
        const relativePath = vscode.workspace.asRelativePath(fileUri, false);

        return index.snapshots
            .filter(s => s.filePath === relativePath || s.eventType === 'label')
            .sort((a, b) => b.timestamp - a.timestamp);
    }

    async getProjectHistory(): Promise<Snapshot[]> {
        await this.init();
        let all: Snapshot[] = [];
        for (const index of this.indices.values()) {
            all = all.concat(index.snapshots);
        }
        return all.sort((a, b) => b.timestamp - a.timestamp);
    }

    async getSnapshotUri(snapshot: Snapshot, fileUri: vscode.Uri): Promise<vscode.Uri> {
        const { root } = await this.getStorageForFile(fileUri);
        return vscode.Uri.joinPath(root, snapshot.storagePath!);
    }

    private async saveIndex(index: HistoryIndex, indexUri: vscode.Uri) {
        this.saveQueue = this.saveQueue.then(async () => {
            try {
                const data = new TextEncoder().encode(JSON.stringify(index, null, 2));
                await vscode.workspace.fs.writeFile(indexUri, data);
            } catch (e) {
                console.error('[HistoryStorage] Index save failed:', e);
            }
        });
        return this.saveQueue;
    }

    async createLabel(name: string, description?: string) {
        let targetUri = this.globalStorageRoot;
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            targetUri = vscode.workspace.workspaceFolders[0].uri;
        }
        const { indexUri } = await this.getStorageForFile(targetUri);
        const index = await this.loadIndex(indexUri);

        index.snapshots.push({
            id: uuidv4(),
            timestamp: Date.now(),
            filePath: '',
            eventType: 'label',
            label: name,
            description
        });
        await this.saveIndex(index, indexUri);
    }
}
