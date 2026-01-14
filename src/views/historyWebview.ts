import * as vscode from 'vscode';
import { Snapshot, GitCommit } from '../types';

export class HistoryViewProvider {
    public static readonly viewType = 'chronos.historyView';

    constructor(private readonly _extensionUri: vscode.Uri) {}

    private _getSharedStyles() {
        return `
            body { margin: 0; padding: 0; color: var(--vscode-editor-foreground); background-color: var(--vscode-editor-background); font-family: var(--vscode-font-family); height: 100vh; overflow: hidden; display: flex; }
            .container { display: flex; width: 100%; height: 100%; }
            .sidebar { width: 300px; min-width: 250px; border-right: 1px solid var(--vscode-panel-border); display: flex; flex-direction: column; background-color: var(--vscode-sideBar-background); }
            .list { flex: 1; overflow-y: auto; }
            .entry { padding: 12px; border-bottom: 1px solid var(--vscode-panel-border); cursor: pointer; transition: background-color 0.2s; }
            .entry:hover { background-color: var(--vscode-list-hoverBackground); }
            .entry.selected { background-color: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
            .header { display: flex; justify-content: space-between; font-size: 0.85em; margin-bottom: 6px; }
            .event-type { font-weight: bold; text-transform: uppercase; font-size: 0.8em; letter-spacing: 0.5px; }
            .label-badge { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 2px 8px; border-radius: 10px; display: inline-block; font-size: 0.8em; margin: 4px 0; }
            .main-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
            .details-header { padding: 20px; border-bottom: 1px solid var(--vscode-panel-border); background-color: var(--vscode-editor-background); z-index: 10; }
            .meta-title { font-size: 1.2em; font-weight: 600; margin-bottom: 4px; }
            .meta-info { opacity: 0.7; font-size: 0.9em; }
            .actions { margin-top: 15px; display: flex; gap: 8px; }
            .actions button { 
                background: var(--vscode-button-background); 
                color: var(--vscode-button-foreground); 
                border: none; 
                padding: 6px 14px; 
                cursor: pointer; 
                border-radius: 2px;
                font-size: 0.9em;
            }
            .actions button:hover { background: var(--vscode-button-hoverBackground); }
            .actions button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
            .actions button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
            .diff-container { flex: 1; overflow: auto; background-color: var(--vscode-editor-background); }
            .empty-state { display: flex; align-items: center; justify-content: center; height: 100%; opacity: 0.5; text-align: center; padding: 40px; font-style: italic; }
            pre { margin: 0; padding: 0; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); line-height: 1.4; }
            .diff-line { display: flex; white-space: pre; min-width: 100%; }
            .diff-line > div { padding: 0 10px; }
            .diff-add { background-color: var(--vscode-diffEditor-insertedTextBackground); color: var(--vscode-gitDecoration-addedResourceForeground); width: 100%; }
            .diff-del { background-color: var(--vscode-diffEditor-removedTextBackground); color: var(--vscode-gitDecoration-deletedResourceForeground); width: 100%; }
            .diff-meta { color: var(--vscode-descriptionForeground); opacity: 0.7; background-color: var(--vscode-editor-lineHighlightBackground); width: 100%; font-weight: bold; }
            .diff-header { color: var(--vscode-symbolIcon-propertyForeground); font-weight: bold; background-color: var(--vscode-editor-lineHighlightBackground); width: 100%; padding: 5px 10px !important; border-bottom: 1px solid var(--vscode-panel-border); }
        `;
    }

    public show(snapshots: Snapshot[], currentFileUri: vscode.Uri | undefined, getDiff?: (s: Snapshot) => Promise<string>, selection?: vscode.Range) {
        const panel = vscode.window.createWebviewPanel(
            HistoryViewProvider.viewType,
            'Chronos',
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
                        vscode.commands.executeCommand('chronos.compareToCurrent', message.snapshotId);
                        return;
                    case 'restore':
                        vscode.commands.executeCommand('chronos.restoreSnapshot', message.snapshotId);
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
            <style>${this._getSharedStyles()}</style>
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
                            <button id="btnCompare" class="secondary">Compare with Current</button>
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
                                '<span>' + date.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"}) + '</span>' + 
                            '</div>' + 
                            (s.label ? '<div class="label-badge">' + s.label + '</div>' : '') + 
                            '<div style="font-size:0.85em; opacity:0.6">' + date.toLocaleDateString() + '</div>' + 
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
                    container.innerHTML = '<pre>' + diff.split('\\n').map(line => {
                        let cls = '';
                        if (line.startsWith("+") && !line.startsWith("+++")) cls = "diff-add";
                        else if (line.startsWith("-") && !line.startsWith("---")) cls = "diff-del";
                        else if (line.startsWith("@@")) cls = "diff-meta";
                        else if (line.startsWith("diff --git") || line.startsWith("---") || line.startsWith("+++") || line.startsWith("index")) cls = "diff-header";
                        return '<div class="diff-line"><div class="' + cls + '">' + escape(line) + '</div></div>';
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
            <style>${this._getSharedStyles()}</style>
        </head>
        <body>
            <div class="container">
                <div class="sidebar">
                    <div id="list" class="list"></div>
                </div>
                <div class="main-view">
                    <div id="detailsHeader" class="details-header" style="display:none">
                        <div id="metaTitle" class="meta-title"></div>
                        <div id="metaInfo" class="meta-info"></div>
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
                                '<span class="event-type" style="font-family:monospace">' + c.hash.substring(0,7) + '</span>' + 
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
                    renderDiff(c.diff);
                }
                function renderDiff(diff) {
                    const container = document.getElementById('diffContainer');
                    if (!diff) {
                        container.innerHTML = '<div class="empty-state">No diff available</div>';
                        return;
                    }
                    container.innerHTML = '<pre>' + diff.split('\\n').map(line => {
                        let cls = '';
                        if (line.startsWith("+") && !line.startsWith("+++")) cls = "diff-add";
                        else if (line.startsWith("-") && !line.startsWith("---")) cls = "diff-del";
                        else if (line.startsWith("@@")) cls = "diff-meta";
                        else if (line.startsWith("diff --git") || line.startsWith("---") || line.startsWith("+++") || line.startsWith("index")) cls = "diff-header";
                        return '<div class="diff-line"><div class="' + cls + '">' + escape(line) + '</div></div>';
                    }).join('') + '</pre>';
                }
                function escape(s) {
                    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                }
            </script>
        </body>
        </html>`;
    }
}