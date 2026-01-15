// Mock classes
class Range {
    constructor(startLine, startChar, endLine, endChar) {
        this.start = { line: startLine, character: startChar };
        this.end = { line: endLine, character: endChar };
    }
}

// Logic from HistoryFilter
function parseHunks(diff) {
    const hunks = [];
    const lines = diff.split('\n');
    
    for (const line of lines) {
        if (line.startsWith('@@')) {
            // @@ -oldStart,oldLines +newStart,newLines @@
            const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
            if (match) {
                hunks.push({
                    oldStart: parseInt(match[1]),
                    oldLines: match[2] ? parseInt(match[2]) : 1,
                    newStart: parseInt(match[3]),
                    newLines: match[4] ? parseInt(match[4]) : 1
                });
            }
        }
    }
    return hunks;
}

function mapRangeBackwards(range, hunks) {
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

        // Update Start
        if (hNewEnd <= start) {
            newStart -= shift;
        } else if (hNewStart < start && hNewEnd > start) {
             newStart = h.oldStart - 1;
        }

        // Update End
        if (hNewEnd <= effectiveEndLine) {
             newEndLine -= shift;
        } else if (hNewStart < effectiveEndLine && hNewEnd > effectiveEndLine) {
             newEndLine = (h.oldStart - 1) + h.oldLines;
        } else if (hNewStart <= effectiveEndLine && hNewEnd > effectiveEndLine) {
             newEndLine = (h.oldStart - 1) + h.oldLines; // Snap to end of hunk
             // Wait, this logic sets the end to the end of the hunk.
             // If we are strictly inside, we should perhaps be careful?
             // But mapBackwards with context/hunk change usually implies the whole hunk is the origin.
        }
    }
    
    return new Range(newStart, 0, newEndLine + 1, 0);
}

function isRelevant(range, hunks) {
    const rStart = range.start.line;
    let effectiveEnd = range.end.line;
    if (range.end.character === 0 && effectiveEnd > rStart) {
        effectiveEnd--;
    }

    for (const h of hunks) {
        const hStart = h.newStart - 1;
        const hEnd = h.newStart - 1 + h.newLines - 1; 

        if (Math.max(rStart, hStart) <= Math.min(effectiveEnd, hEnd)) {
            return true;
        }
    }
    return false;
}

// Tests
console.log("Running Tests...");

// Case 1: Simple Mod
// Old: A (1 line) -> New: B (1 line)
// Diff: @@ -1,1 +1,1 @@
const diff1 = "@@ -1,1 +1,1 @@";
const hunks1 = parseHunks(diff1);
const r1 = new Range(0,0, 1,0); // Select line 0
const mapped1 = mapRangeBackwards(r1, hunks1);
console.log("Case 1 (Mod): Input [0,1), Mapped:", mapped1.start.line, mapped1.end.line);
// Expect: [0, 2) ? Because it expands to hunk size?
// Hunk Old: 1,1. Start 0, Lines 1. End 0.
// My logic: newEndLine = (1-1)+1 = 1. Range 0..2. (Covers 0 and 1).
// Wait, range 0..1 is just line 0. Range 0..2 is lines 0 and 1.
// If hunk is 1 line, why expand to 2 lines?
// newEndLine is inclusive index. 
// If h.oldStart=1 (index 0), h.oldLines=1. End index = 0.
// Formula should be `(h.oldStart - 1) + h.oldLines - 1`.

// Case 2: Insertion Before
// Old: A, C. New: A, B, C.
// Diff: @@ -1,2 +1,3 @@ (Context A)
// Or @@ -2,0 +2,1 @@ (No context)
// Let's test @@ -2,0 +2,1 @@
// Insert B at line 2 (index 1).
// Select C (Index 2 in New).
const diff2 = "@@ -2,0 +2,1 @@"; 
// oldStart 2, oldLines 0. newStart 2, newLines 1.
const hunks2 = parseHunks(diff2);
const r2 = new Range(2,0, 3,0); // Select line 2 (C)
const mapped2 = mapRangeBackwards(r2, hunks2);
console.log("Case 2 (Insert Before): Input [2,3), Mapped:", mapped2.start.line, mapped2.end.line);
// shift = 1 - 0 = 1.
// hNewEnd = 2-1+1 = 2.
// start=2. hNewEnd(2) <= start(2). True.
// newStart = 2 - 1 = 1.
// newEndLine = 2 - 1 = 1.
// Result 1..2. Correct (Line 1 in Old is C).

// Case 3: Deletion Before
// Old: A, B, C. New: A, C.
// Diff: @@ -2,1 +2,0 @@
// Remove line 2 (Index 1).
// Select C (Index 1 in New).
const diff3 = "@@ -2,1 +2,0 @@";
const hunks3 = parseHunks(diff3);
const r3 = new Range(1,0, 2,0); // Select line 1 (C)
const mapped3 = mapRangeBackwards(r3, hunks3);
console.log("Case 3 (Delete Before): Input [1,2), Mapped:", mapped3.start.line, mapped3.end.line);
// shift = 0 - 1 = -1.
// hNewEnd = 2-1+0 = 1.
// start=1. hNewEnd(1) <= start(1). True.
// newStart = 1 - (-1) = 2.
// newEndLine = 1 - (-1) = 2.
// Result 2..3. Correct (Line 2 in Old is C).
