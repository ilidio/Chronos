# Chronos & Git History

Comprehensive history management for Visual Studio Code. This extension provides a robust, non-Git Chronos history (automatic snapshots) and a specialized Git history view for specific code selections.

## 🚀 Installation

### For Developers (Running from Source)
1. Ensure you have [Node.js](https://nodejs.org/) and `npm` installed.
2. Clone or download this repository.
3. Open the `local-history-extension` folder in VS Code.
4. Run `npm install` in the terminal to install dependencies.
5. Press **F5** (or go to `Run and Debug` -> `Run Extension`) to launch a new **Extension Development Host** window with the extension active.

### For Users (VSIX)
If you have a `.vsix` file:
1. Open VS Code.
2. Go to the **Extensions** view (`Cmd+Shift+X` or `Ctrl+Shift+X`).
3. Click the `...` (More Actions) at the top right of the sidebar.
4. Select **Install from VSIX...** and choose the generated file.

---

## 📖 How to Use in VS Code

### 1. Chronos (The Safety Net)
The extension automatically starts tracking your files as soon as you save them.

- **View History:** Right-click anywhere in an open editor or on a file in the Explorer and select **Chronos > Show History**.
- **Compare Changes:** In the History view, click **Compare** on any snapshot to see a side-by-side diff against your current code.
- **Revert/Restore:** Click **Restore** to immediately roll back your file to that specific point in time.

### 2. Creating Labels (Checkpoints)
Before starting a complex refactor:
1. Right-click and select **Chronos > Put Label...**.
2. Give it a name (e.g., "Working state before API change").
3. This label will appear in your timeline, making it easy to find that specific version later.

### 3. Selection History (Granular Tracking)
- **Chronos:** Select a block of code, right-click -> **Chronos > Show History for Selection**.
- **Git History:** Select a block of code, right-click -> **Git History for Selection**. This uses Git's powerful logic to show only the commits that modified those specific lines.

### 4. Project-Wide History
Want to see everything you've changed today?
- Run the command `Chronos: Show Project History` from the Command Palette (`Cmd+Shift+P`).

---

## ⚙️ Configuration

You can tune the extension in **File > Preferences > Settings** (search for `chronos`):

- `chronos.enabled`: Toggle the entire system.
- `chronos.maxDays`: Automatically prune old history (default: 30 days).
- `chronos.exclude`: Add folders like `build/` or `temp/` to keep your history storage clean.

## 🛠 Commands Reference

| Command | Description |
| --- | --- |
| `Chronos: Show History` | Show timeline for the active file |
| `Chronos: Put Label` | Create a named checkpoint |
| `Chronos: Show Project History` | View changes across the whole workspace |
| `Chronos: Git History for Selection` | Show Git commits for selected lines |

---

## 🛡️ Data & Privacy
All history is stored **locally on your machine** in the VS Code workspace storage folder. No data is ever sent to a server.