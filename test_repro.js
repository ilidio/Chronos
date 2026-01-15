const fs = require('fs');
const cp = require('child_process');
const path = require('path');

// --- Mock Classes ---
class Range {
    constructor(startLine, startChar, endLine, endChar) {
        this.start = { line: startLine, character: startChar };
        this.end = { line: endLine, character: endChar };
    }
}

// --- HistoryFilter Logic (Copy-Pasted & Adapted) ---
class HistoryFilter {
    constructor() {}

    // Mock storage/git calls for standalone test
    async getDiff(oldPath, newPath) {
        return new Promise((resolve) => {
            const args = ['diff', '--no-index', oldPath, newPath];
            const git = cp.spawn('git', args);
            let stdout = '';
            git.stdout.on('data', d => stdout += d);
            git.on('close', () => resolve(stdout));
        });
    }

    parseHunks(diff) {
        const hunks = [];
        const lines = diff.split('\n');
        let currentHunk = null;
        let currentNew = 0;

        for (const line of lines) {
            if (line.startsWith('@@')) {
                const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
                if (match) {
                    if (currentHunk) hunks.push(currentHunk);
                    
                    const newStart = parseInt(match[3]);
                    currentHunk = {
                        oldStart: parseInt(match[1]),
                        oldLines: match[2] ? parseInt(match[2]) : 1,
                        newStart: newStart,
                        newLines: match[4] ? parseInt(match[4]) : 1,
                        touchedLines: new Set() // Indices in New
                    };
                    currentNew = newStart - 1; // 0-based
                }
            } else if (currentHunk) {
                if (line.startsWith(' ')) {
                    currentNew++;
                } else if (line.startsWith('-')) {
                    // Deletion: affects the current seam (currentNew). 
                    // We mark currentNew as touched because the content *at* this position (or the lack thereof) is the change.
                    currentHunk.touchedLines.add(currentNew);
                } else if (line.startsWith('+')) {
                    // Addition: The content at currentNew is new.
                    currentHunk.touchedLines.add(currentNew);
                    currentNew++;
                }
                // Ignore headers/meta
            }
        }
        if (currentHunk) hunks.push(currentHunk);
        return hunks;
    }

    mapRangeBackwards(range, hunks) {
        // ... (Same as before)
        let start = range.start.line;
        let end = range.end.line;
        let effectiveEndLine = end;
        if (range.end.character === 0 && end > start) {
            effectiveEndLine--;
        }

        let newStart = start;
        let newEndLine = effectiveEndLine;

        for (const h of hunks) {
            const hNewStart = h.newStart - 1;
            const hNewEnd = h.newStart - 1 + h.newLines; 
            const shift = h.newLines - h.oldLines;

            if (hNewEnd <= start) {
                newStart -= shift;
            } else if (hNewStart < start && hNewEnd > start) {
                 newStart = h.oldStart - 1;
            }

            if (hNewEnd <= effectiveEndLine) {
                 newEndLine -= shift;
            } else if (hNewStart < effectiveEndLine && hNewEnd > effectiveEndLine) {
                 newEndLine = (h.oldStart - 1) + (h.oldLines > 0 ? h.oldLines - 1 : 0);
            } else if (hNewStart <= effectiveEndLine && hNewEnd > effectiveEndLine) {
                 newEndLine = (h.oldStart - 1) + (h.oldLines > 0 ? h.oldLines - 1 : 0); 
            }
        }
        return new Range(newStart, 0, newEndLine + 1, 0);
    }

    isRelevant(range, hunks) {
        const rStart = range.start.line;
        let effectiveEnd = range.end.line;
        if (range.end.character === 0 && effectiveEnd > rStart) {
            effectiveEnd--;
        }

        for (const h of hunks) {
            for (const lineIdx of h.touchedLines) {
                if (lineIdx >= rStart && lineIdx <= effectiveEnd) {
                    return true;
                }
            }
        }
        return false;
    }
}

// --- Test Setup ---
const filter = new HistoryFilter();
const tmpDir = './tmp_test';
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

async function runTest() {
    console.log("Starting Repro Test...");

    const fileA = path.join(tmpDir, 'fileA.txt');
    const fileB = path.join(tmpDir, 'fileB.txt');

    // Scenario 1: Select All + Append
    console.log("\n--- Scenario 1: Select All + Append ---");
    // Old: 3 lines. New: 4 lines (Appended).
    fs.writeFileSync(fileA, "Line 1\nLine 2\nLine 3\n");
    fs.writeFileSync(fileB, "Line 1\nLine 2\nLine 3\nLine 4\n");
    
    // Select All in New (File B): 0-4
    const sel1 = new Range(0, 0, 4, 0); 
    
    // Diff Old -> New
    const diff1 = await filter.getDiff(fileA, fileB);
    console.log("Diff:", diff1.trim());
    const hunks1 = filter.parseHunks(diff1);
    console.log("Hunks:", hunks1);
    
    const relevant1 = filter.isRelevant(sel1, hunks1);
    console.log("Is Relevant?", relevant1); // Expect True
    
    const mapped1 = filter.mapRangeBackwards(sel1, hunks1);
    console.log("Mapped Range:", mapped1.start.line, mapped1.end.line);
    // Expect 0-3 (Lines 0,1,2)

    // Scenario 2: Partial Selection (Top) + Append
    console.log("\n--- Scenario 2: Top Selection + Append ---");
    const sel2 = new Range(0, 0, 2, 0); // Lines 0, 1
    const relevant2 = filter.isRelevant(sel2, hunks1);
    console.log("Is Relevant?", relevant2); // Expect False (Append is at line 3/4)

    // Scenario 3: Modification Inside
    console.log("\n--- Scenario 3: Modification Inside ---");
    fs.writeFileSync(fileA, "Line 1\nLine 2\nLine 3\n");
    fs.writeFileSync(fileB, "Line 1\nModified\nLine 3\n");
    
    const diff3 = await filter.getDiff(fileA, fileB);
    console.log("Diff:", diff3.trim());
    const hunks3 = filter.parseHunks(diff3);
    
    const sel3 = new Range(1, 0, 2, 0); // Line 1
    const relevant3 = filter.isRelevant(sel3, hunks3);
    console.log("Is Relevant?", relevant3); // Expect True
    
    const mapped3 = filter.mapRangeBackwards(sel3, hunks3);
    console.log("Mapped Range:", mapped3.start.line, mapped3.end.line);

    // Clean up
    fs.unlinkSync(fileA);
    fs.unlinkSync(fileB);
    fs.rmdirSync(tmpDir);
}

runTest();
