import * as vscode from 'vscode';
import * as path from 'path';
import { HistoryStorage } from './storage';
import { HistoryManager } from './historyManager';
import { HistoryViewProvider } from './views/historyWebview';
import { GitService } from './git/gitService';
import { Snapshot } from './types';

let storage: HistoryStorage;
let manager: HistoryManager;
let viewProvider: HistoryViewProvider;
let gitService: GitService;

export function activate(context: vscode.ExtensionContext) {
    console.log('Activating IntelliJ-Style Local History...');

    storage = new HistoryStorage(context);
    viewProvider = new HistoryViewProvider(context.extensionUri);
    gitService = new GitService();
    manager = new HistoryManager(context, storage);

    context.subscriptions.push(
        vscode.commands.registerCommand('localHistory.showHistory', showHistory),
        vscode.commands.registerCommand('localHistory.showHistoryForSelection', showHistoryForSelection),
        vscode.commands.registerCommand('localHistory.showProjectHistory', showProjectHistory),
        vscode.commands.registerCommand('localHistory.showRecentChanges', showRecentChanges),
        vscode.commands.registerCommand('localHistory.putLabel', putLabel),
        vscode.commands.registerCommand('localHistory.compareToCurrent', compareToCurrent),
        vscode.commands.registerCommand('localHistory.restoreSnapshot', restoreSnapshot),
        vscode.commands.registerCommand('localHistory.gitHistoryForSelection', gitHistoryForSelection)
    );

    storage.init().catch(err => console.error('Storage init failed:', err));
}

async function ensureStorage() {
    await storage.init();
}

async function getDiffForSnapshot(snapshot: Snapshot, fileUri: vscode.Uri): Promise<string> {
    await ensureStorage();
    const fileHistory = await storage.getHistoryForFile(fileUri);
    const index = fileHistory.findIndex(s => s.id === snapshot.id);

    if (index === -1) return 'Snapshot not found in file history.';

    let prevPath = '';
    if (index === fileHistory.length - 1) {
         prevPath = process.platform === 'win32' ? 'NUL' : '/dev/null';
    } else {
         const prevSnapshot = fileHistory[index + 1];
         if (!prevSnapshot.storagePath) return 'Previous snapshot content unavailable.';
         prevPath = (await storage.getSnapshotUri(prevSnapshot, fileUri)).fsPath;
    }

    if (!snapshot.storagePath) return 'Snapshot has no content.';
    const currentPath = (await storage.getSnapshotUri(snapshot, fileUri)).fsPath;

    let diff = await gitService.getDiff(prevPath, currentPath);

    // Clean up diff header
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
    const relativePath = workspaceFolder 
        ? path.relative(workspaceFolder.uri.fsPath, fileUri.fsPath)
        : path.basename(fileUri.fsPath);

    // Escape backslashes for regex if on Windows
    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    diff = diff.replace(new RegExp(escapeRegex(prevPath), 'g'), 'a/' + relativePath);
    diff = diff.replace(new RegExp(escapeRegex(currentPath), 'g'), 'b/' + relativePath);

    return diff;
}

async function showHistory(uri?: vscode.Uri, selection?: vscode.Range) {
    await ensureStorage();
    if (!uri) {
        uri = vscode.window.activeTextEditor?.document.uri;
    }
    if (!uri) return;

    const history = await storage.getHistoryForFile(uri);
    
    if (history.length === 0) {
        vscode.window.showInformationMessage('No local history found for this file.');
    }
    
    // Wrap diff provider to include the specific fileUri context
    const diffProvider = (s: Snapshot) => getDiffForSnapshot(s, uri!);
    
    viewProvider.show(history, uri, diffProvider, selection);
}

async function showHistoryForSelection() {
    await ensureStorage();
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    await showHistory(editor.document.uri, editor.selection);
}

async function showProjectHistory() {
    await ensureStorage();
    const history = await storage.getProjectHistory();
    viewProvider.show(history, undefined);
}

async function showRecentChanges() {
    await ensureStorage();
    const history = await storage.getProjectHistory();
    viewProvider.show(history.slice(0, 20), undefined);
}

async function putLabel() {
    await ensureStorage();
    const name = await vscode.window.showInputBox({ prompt: 'Label Name' });
    if (!name) return;
    const desc = await vscode.window.showInputBox({ prompt: 'Description (optional)' });
    await manager.putLabel(name, desc);
}

async function compareToCurrent(snapshotId: string) {
    await ensureStorage();
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const history = await storage.getHistoryForFile(editor.document.uri);
    const snapshot = history.find(s => s.id === snapshotId);
    if (!snapshot) return;

    try {
        const snapshotUri = await storage.getSnapshotUri(snapshot, editor.document.uri);
        await vscode.commands.executeCommand(
            'vscode.diff',
            snapshotUri,
            editor.document.uri,
            `Local History: ${new Date(snapshot.timestamp).toLocaleString()} vs Current`
        );
    } catch (e) {
        vscode.window.showErrorMessage('Could not open diff.');
    }
}

async function restoreSnapshot(snapshotId: string) {
    await ensureStorage();
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const history = await storage.getHistoryForFile(editor.document.uri);
    const snapshot = history.find(s => s.id === snapshotId);
    if (!snapshot) return;

    const snapshotUri = await storage.getSnapshotUri(snapshot, editor.document.uri);
    const content = await vscode.workspace.fs.readFile(snapshotUri);
    
    const fullRange = new vscode.Range(0, 0, editor.document.lineCount, 0);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(editor.document.uri, fullRange, new TextDecoder().decode(content));
    await vscode.workspace.applyEdit(edit);
}

async function gitHistoryForSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selection = editor.selection;
    if (selection.isEmpty) return;

    const config = vscode.workspace.getConfiguration('gitHistory.selection');
    const gitConfig = {
        maxCommits: config.get<number>('maxCommits', 100),
        followRenames: config.get<boolean>('followRenames', true),
        dateFormat: config.get<string>('dateFormat', 'yyyy-MM-dd HH:mm')
    };

    try {
        const commits = await gitService.getHistoryForSelection(
            editor.document.uri.fsPath,
            selection.start.line,
            selection.end.line,
            gitConfig
        );
        if (commits.length > 0) {
            viewProvider.showGit(commits);
        } else {
            vscode.window.showInformationMessage('No git history found.');
        }
    } catch (e) {
        vscode.window.showErrorMessage('Failed to load git history.');
    }
}

export function deactivate() {}
