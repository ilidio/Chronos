import * as vscode from 'vscode';
import { Snapshot, GitCommit } from '../types';

export class HistoryViewProvider {
    public static readonly viewType = 'localHistory.historyView';

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public show(snapshots: Snapshot[], currentFileUri: vscode.Uri | undefined, getDiff?: (s: Snapshot) => Promise<string>, selection?: vscode.Range) {
        const panel = vscode.window.createWebviewPanel(
            HistoryViewProvider.viewType,
            'Local History',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                localResourceRoots: [this._extensionUri],
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = this._getHtmlForWebview();

        const selectionData = selection ? {
            startLine: selection.start.line,
            endLine: selection.end.line
        } : null;

        panel.webview.onDidReceiveMessage(
            async message => {
                console.log('[HistoryViewProvider] Received message:', message.command);
                switch (message.command) {
                    case 'ready':
                        panel.webview.postMessage({
                            command: 'loadHistory',
                            snapshots,
                            selection: selectionData,
                            filePath: currentFileUri ? currentFileUri.fsPath : 'unknown'
                        });
                        return;
                    case 'compare':
                        vscode.commands.executeCommand('localHistory.compareToCurrent', message.snapshotId);
                        return;
                    case 'restore':
                        vscode.commands.executeCommand('localHistory.restoreSnapshot', message.snapshotId);
                        return;
                    case 'getDiff':
                        if (getDiff) {
                            const snapshot = snapshots.find(s => s.id === message.snapshotId);
                            if (snapshot) {
                                try {
                                    const diff = await getDiff(snapshot);
                                    panel.webview.postMessage({ command: 'diffLoaded', diff });
                                } catch (e) {
                                    panel.webview.postMessage({ command: 'diffLoaded', diff: 'Error loading diff: ' + e });
                                }
                            }
                        }
                        return;
                }
            }
        );
    }

    public showGit(commits: GitCommit[]) {
        const panel = vscode.window.createWebviewPanel(
            HistoryViewProvider.viewType,
            'Git History Selection',
            vscode.ViewColumn.Two,
            { enableScripts: true }
        );

        panel.webview.html = this._getGitHtml();
        
        panel.webview.onDidReceiveMessage(message => {
            if (message.command === 'ready') {
                panel.webview.postMessage({ command: 'loadCommits', commits });
            }
        });
    }

    private _getHtmlForWebview() {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <style>
                body { margin: 0; padding: 0; color: var(--vscode-editor-foreground); background-color: var(--vscode-editor-background); font-family: var(--vscode-font-family); height: 100vh; overflow: hidden; display: flex; }
                .container { display: flex; width: 100%; height: 100%; }
                .sidebar { width: 300px; min-width: 250px; border-right: 1px solid var(--vscode-panel-border); display: flex; flex-direction: column; background-color: var(--vscode-sideBar-background); }
                .list { flex: 1; overflow-y: auto; }
                .entry { padding: 10px; border-bottom: 1px solid var(--vscode-panel-border); cursor: pointer; }
                .entry:hover { background-color: var(--vscode-list-hoverBackground); }
                .entry.selected { background-color: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
                .header { display: flex; justify-content: space-between; font-size: 0.85em; margin-bottom: 4px; }
                .event-type { font-weight: bold; }
                .label-badge { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 2px 6px; border-radius: 3px; display: inline-block; font-size: 0.85em; margin: 4px 0; }
                .main-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
                .details-header { padding: 15px 20px; border-bottom: 1px solid var(--vscode-panel-border); }
                .meta-title { font-size: 1.2em; font-weight: bold; }
                .meta-info { opacity: 0.8; font-size: 0.9em; margin-top: 4px; }
                .actions { margin-top: 10px; display: flex; gap: 10px; }
                .actions button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 12px; cursor: pointer; }
                .actions button:hover { background: var(--vscode-button-hoverBackground); }
                .diff-container { flex: 1; overflow: auto; }
                .empty-state { display: flex; align-items: center; justify-content: center; height: 100%; opacity: 0.6; text-align: center; padding: 20px; }
                pre { margin: 0; padding: 10px; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
                .diff-add { background-color: rgba(0, 255, 0, 0.1); color: var(--vscode-gitDecoration-addedResourceForeground); }
                .diff-del { background-color: rgba(255, 0, 0, 0.1); color: var(--vscode-gitDecoration-deletedResourceForeground); }
                .diff-meta { opacity: 0.5; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="sidebar">
                    <div id="list" class="list"><div class="empty-state">Initializing...</div></div>
                </div>
                <div class="main-view">
                    <div id="detailsHeader" class="details-header" style="display:none">
                        <div id="metaTitle" class="meta-title"></div>
                        <div id="metaInfo" class="meta-info"></div>
                        <div class="actions">
                            <button id="btnRestore">Restore</button>
                            <button id="btnCompare">Compare</button>
                        </div>
                    </div>
                    <div id="diffContainer" class="diff-container">
                        <div class="empty-state">Select an entry from the sidebar</div>
                    </div>
                </div>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                let snapshots = [];

                window.onload = () => {
                    vscode.postMessage({ command: 'ready' });
                };

                window.addEventListener('message', event => {
                    const msg = event.data;
                    if (msg.command === 'loadHistory') {
                        snapshots = msg.snapshots || [];
                        renderList(msg.filePath);
                        if (snapshots.length > 0) selectSnapshot(0);
                    } else if (msg.command === 'diffLoaded') {
                        renderDiff(msg.diff);
                    }
                });

                function renderList(path) {
                    const el = document.getElementById('list');
                    if (snapshots.length === 0) {
                        el.innerHTML = '<div class="empty-state">No history found for:<br>' + path + '</div>';
                        return;
                    }
                    el.innerHTML = snapshots.map((s, i) => {
                        const date = new Date(s.timestamp);
                        return '<div class="entry" onclick="selectSnapshot(' + i + ')">' + 
                            '<div class="header">' + 
                                '<span class="event-type">' + s.eventType + '</span>' + 
                                '<span>' + date.toLocaleTimeString() + '</span>' + 
                            '</div>' + 
                            (s.label ? '<div class="label-badge">' + s.label + '</div>' : '') + 
                            '<div style="font-size:0.8em; opacity:0.6">' + date.toLocaleDateString() + '</div>' + 
                        '</div>';
                    }).join('');
                }

                function selectSnapshot(i) {
                    const s = snapshots[i];
                    const entries = document.querySelectorAll('.entry');
                    entries.forEach((e, idx) => e.classList.toggle('selected', idx === i));
                    
                    document.getElementById('detailsHeader').style.display = 'block';
                    document.getElementById('metaTitle').textContent = s.label || (s.eventType.charAt(0).toUpperCase() + s.eventType.slice(1) + ' Snapshot');
                    document.getElementById('metaInfo').textContent = new Date(s.timestamp).toLocaleString();
                    
                    document.getElementById('btnRestore').onclick = () => vscode.postMessage({ command: 'restore', snapshotId: s.id });
                    document.getElementById('btnCompare').onclick = () => vscode.postMessage({ command: 'compare', snapshotId: s.id });
                    
                    document.getElementById('diffContainer').innerHTML = '<div class="empty-state">Loading changes...</div>';
                    vscode.postMessage({ command: 'getDiff', snapshotId: s.id });
                }

                function renderDiff(diff) {
                    const container = document.getElementById('diffContainer');
                    if (!diff || diff.trim() === '') {
                        container.innerHTML = '<div class="empty-state">No changes detected.</div>';
                        return;
                    }
                    container.innerHTML = '<pre>' + diff.split(\'n\').map(line => {
                        let cls = '';
                        if (line.startsWith("+") && !line.startsWith("+++")) cls = "diff-add";
                        else if (line.startsWith("-") && !line.startsWith("---")) cls = "diff-del";
                        else if (line.startsWith("diff") || line.startsWith("@@")) cls = "diff-meta";
                        return '<div class="' + cls + '">' + escape(line) + '</div>';
                    }).join('') + '</pre>';
                }

                function escape(s) {
                    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                }
            </script>
        </body>
        </html>`;
    }

    private _getGitHtml() {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <style>
                body { margin: 0; padding: 0; color: var(--vscode-editor-foreground); background-color: var(--vscode-editor-background); font-family: var(--vscode-font-family); height: 100vh; overflow: hidden; display: flex; }
                .container { display: flex; width: 100%; height: 100%; }
                .sidebar { width: 300px; min-width: 250px; border-right: 1px solid var(--vscode-panel-border); display: flex; flex-direction: column; background-color: var(--vscode-sideBar-background); }
                .list { flex: 1; overflow-y: auto; }
                .entry { padding: 10px; border-bottom: 1px solid var(--vscode-panel-border); cursor: pointer; }
                .entry:hover { background-color: var(--vscode-list-hoverBackground); }
                .entry.selected { background-color: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
                .header { display: flex; justify-content: space-between; font-size: 0.85em; margin-bottom: 4px; }
                .main-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
                .details-header { padding: 15px 20px; border-bottom: 1px solid var(--vscode-panel-border); }
                .meta-title { font-size: 1.1em; font-weight: bold; }
                .diff-container { flex: 1; overflow: auto; }
                .empty-state { display: flex; align-items: center; justify-content: center; height: 100%; opacity: 0.6; }
                pre { margin: 0; padding: 10px; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
                .diff-add { background-color: rgba(0, 255, 0, 0.1); color: var(--vscode-gitDecoration-addedResourceForeground); }
                .diff-del { background-color: rgba(255, 0, 0, 0.1); color: var(--vscode-gitDecoration-deletedResourceForeground); }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="sidebar">
                    <div id="list" class="list"></div>
                </div>
                <div class="main-view">
                    <div id="detailsHeader" class="details-header" style="display:none">
                        <div id="metaTitle" class="meta-title"></div>
                        <div id="metaInfo" style="opacity:0.8; font-size:0.9em"></div>
                    </div>
                    <div id="diffContainer" class="diff-container">
                        <div class="empty-state">Select a commit</div>
                    </div>
                </div>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                let commits = [];
                window.onload = () => vscode.postMessage({ command: 'ready' });
                window.addEventListener('message', event => {
                    const msg = event.data;
                    if (msg.command === 'loadCommits') {
                        commits = msg.commits || [];
                        render();
                        if (commits.length > 0) select(0);
                    }
                });
                function render() {
                    document.getElementById('list').innerHTML = commits.map((c, i) => {
                        return '<div class="entry" onclick="select(' + i + ')">' + 
                            '<div class="header">' + 
                                '<span style="font-family:monospace">' + c.hash.substring(0,7) + '</span>' + 
                                '<span>' + c.date + '</span>' + 
                            '</div>' + 
                            '<div style="font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">' + c.message + '</div>' + 
                        '</div>';
                    }).join('');
                }
                function select(i) {
                    const c = commits[i];
                    const entries = document.querySelectorAll('.entry');
                    entries.forEach((e, idx) => e.classList.toggle('selected', idx === i));
                    document.getElementById('detailsHeader').style.display = 'block';
                    document.getElementById('metaTitle').textContent = c.message;
                    document.getElementById('metaInfo').textContent = c.author + ' on ' + c.date;
                    document.getElementById('diffContainer').innerHTML = '<pre>' + format(c.diff) + '</pre>';
                }
                function format(diff) {
                    return diff.split(\'n\').map(l => {
                        let cls = '';
                        if (l.startsWith('+') && !l.startsWith('+++')) cls = 'diff-add';
                        else if (l.startsWith('-') && !l.startsWith('---')) cls = 'diff-del';
                        return '<div class="' + cls + '">' + l.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</div>';
                    }).join('');
                }
            </script>
        </body>
        </html>`;
    }
}