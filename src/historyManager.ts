import * as vscode from 'vscode';
import { HistoryStorage } from './storage';
import { LocalHistoryConfig } from './types';
import { minimatch } from 'minimatch';

export class HistoryManager {
    private storage: HistoryStorage;
    private config: LocalHistoryConfig;

    constructor(context: vscode.ExtensionContext, storage: HistoryStorage) {
        this.storage = storage;
        this.config = this.loadConfig();

        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('localHistory')) {
                this.config = this.loadConfig();
            }
        });

        if (this.config.enabled) {
            this.activate(context);
        }
    }

    private loadConfig(): LocalHistoryConfig {
        const config = vscode.workspace.getConfiguration('localHistory');
        return {
            enabled: config.get<boolean>('enabled', true),
            maxDays: config.get<number>('maxDays', 30),
            maxSizeMB: config.get<number>('maxSizeMB', 500),
            trackSelectionHistory: config.get<boolean>('trackSelectionHistory', true),
            exclude: config.get<string[]>('exclude', [])
        };
    }

    private activate(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument(this.onSave, this),
            vscode.workspace.onDidOpenTextDocument(this.onOpen, this),
            vscode.workspace.onDidRenameFiles(this.onRename, this),
            vscode.workspace.onDidDeleteFiles(this.onDelete, this)
        );

        setTimeout(() => {
            vscode.workspace.textDocuments.forEach(doc => this.onOpen(doc));
        }, 1000);
    }

    private isExcluded(path: string): boolean {
        return this.config.exclude.some(pattern => minimatch(path, pattern));
    }

    private async onOpen(doc: vscode.TextDocument) {
        if (doc.uri.scheme !== 'file') return;
        const relativePath = vscode.workspace.asRelativePath(doc.uri, false);
        if (this.isExcluded(relativePath)) return;

        try {
            const history = await this.storage.getHistoryForFile(doc.uri);
            if (history.filter(s => s.eventType !== 'label').length === 0) {
                console.log('[HistoryManager] Creating initial baseline for:', relativePath);
                await this.storage.saveSnapshot(doc, 'manual', 'Initial Baseline');
            }
        } catch (e) {
            console.error('[HistoryManager] onOpen baseline failed:', e);
        }
    }

    private async onSave(doc: vscode.TextDocument) {
        if (doc.uri.scheme !== 'file') return;
        const relativePath = vscode.workspace.asRelativePath(doc.uri, false);
        if (this.isExcluded(relativePath)) return;

        try {
            const result = await this.storage.saveSnapshot(doc, 'save');
            if (result) {
                vscode.window.setStatusBarMessage('Snapshot: ' + relativePath, 2000);
            }
        } catch (e) {
            console.error('[HistoryManager] Save failed:', e);
        }
    }

    private async onRename(e: vscode.FileRenameEvent) {
        for (const file of e.files) {
            try {
                const doc = await vscode.workspace.openTextDocument(file.newUri);
                const relativePath = vscode.workspace.asRelativePath(file.newUri, false);
                if (this.isExcluded(relativePath)) continue;
                await this.storage.saveSnapshot(doc, 'rename');
            } catch (err) {}
        }
    }

    private async onDelete(e: vscode.FileDeleteEvent) {}

    public async putLabel(name: string, description?: string) {
        await this.storage.createLabel(name, description);
    }
}