import { continuesTimelineTurn, isTimelineTurnTrigger } from "@getpaseo/protocol/timeline-turn";
import { timelineItemIdentity } from "@getpaseo/protocol/timeline-identity";
function appendSeqToRanges(ranges, seq) {
    if (ranges.length === 0) {
        return [{ startSeq: seq, endSeq: seq }];
    }
    const next = [...ranges];
    const last = next[next.length - 1];
    if (!last) {
        return [{ startSeq: seq, endSeq: seq }];
    }
    if (seq <= last.endSeq + 1) {
        next[next.length - 1] = { ...last, endSeq: Math.max(last.endSeq, seq) };
        return next;
    }
    next.push({ startSeq: seq, endSeq: seq });
    return next;
}
function mergeSeqRanges(existing, incoming) {
    let merged = [...existing];
    for (const range of incoming) {
        for (let seq = range.startSeq; seq <= range.endSeq; seq += 1) {
            merged = appendSeqToRanges(merged, seq);
        }
    }
    return merged;
}
function mergeToolCallDetail(existing, incoming) {
    if (existing.type === "unknown" && incoming.type !== "unknown") {
        return incoming;
    }
    if (incoming.type === "unknown" && existing.type !== "unknown") {
        return existing;
    }
    return incoming;
}
/** Fold a later update for the same tool call into the one it follows. */
export function mergeToolCallItems(existing, incoming) {
    const mergedDetail = mergeToolCallDetail(existing.detail, incoming.detail);
    const mergedMetadata = existing.metadata || incoming.metadata
        ? { ...existing.metadata, ...incoming.metadata }
        : undefined;
    const merged = {
        ...existing,
        ...incoming,
        detail: mergedDetail,
        metadata: mergedMetadata,
    };
    if (incoming.status === "failed") {
        merged.error = incoming.error;
    }
    else if (incoming.status === "completed" || incoming.status === "canceled") {
        merged.error = null;
    }
    else if (incoming.error !== undefined) {
        merged.error = incoming.error;
    }
    return merged;
}
function makeCanonicalEntries(rows) {
    return rows.map((row) => {
        if ("seqStart" in row)
            return { ...row };
        return {
            item: row.item,
            timestamp: row.timestamp,
            ...(row.turnId ? { turnId: row.turnId } : {}),
            ...(row.providerMessageId ? { providerMessageId: row.providerMessageId } : {}),
            seqStart: row.seq,
            seqEnd: row.seq,
            sourceSeqRanges: [{ startSeq: row.seq, endSeq: row.seq }],
            collapsed: [],
        };
    });
}
function mergeIdentityMetadata(existing, entry, collapseKind) {
    return {
        sourceSeqRanges: mergeSeqRanges(existing.sourceSeqRanges, entry.sourceSeqRanges),
        collapsed: existing.collapsed.includes(collapseKind)
            ? existing.collapsed
            : [...existing.collapsed, collapseKind],
    };
}
function mergeIdentityEntries(existing, entry) {
    switch (entry.item.type) {
        case "tool_call":
            if (existing.item.type !== "tool_call" || existing.turnId !== entry.turnId)
                return null;
            return {
                ...existing,
                item: mergeToolCallItems(existing.item, entry.item),
                timestamp: entry.timestamp,
                seqEnd: Math.max(existing.seqEnd, entry.seqEnd),
                ...mergeIdentityMetadata(existing, entry, "tool_lifecycle"),
            };
        case "plugin":
            if (existing.item.type !== "plugin")
                return null;
            return {
                ...entry,
                seqStart: existing.seqStart,
                ...mergeIdentityMetadata(existing, entry, "identity"),
            };
        default:
            return null;
    }
}
function collapseByIdentity(entries) {
    const output = [];
    const indexByIdentity = new Map();
    for (const entry of entries) {
        const identity = timelineItemIdentity(entry.item);
        if (identity === null) {
            output.push(entry);
            continue;
        }
        const existingIndex = indexByIdentity.get(identity);
        if (existingIndex === undefined) {
            indexByIdentity.set(identity, output.length);
            output.push(entry);
            continue;
        }
        const existing = output[existingIndex];
        const merged = existing ? mergeIdentityEntries(existing, entry) : null;
        if (!merged) {
            indexByIdentity.set(identity, output.length);
            output.push(entry);
            continue;
        }
        output[existingIndex] = merged;
    }
    return output;
}
function mergeReasoningChunks(entries) {
    const output = [];
    for (const entry of entries) {
        const previous = output[output.length - 1];
        const shouldMerge = previous &&
            previous.item.type === "reasoning" &&
            entry.item.type === "reasoning" &&
            previous.seqEnd + 1 === entry.seqStart &&
            previous.turnId === entry.turnId;
        if (!shouldMerge || !previous) {
            output.push(entry);
            continue;
        }
        const previousReasoning = previous.item;
        const entryReasoning = entry.item;
        const collapsedKinds = new Set([
            ...previous.collapsed,
            ...entry.collapsed,
            "reasoning_merge",
        ]);
        output[output.length - 1] = {
            ...previous,
            item: {
                type: "reasoning",
                text: `${previousReasoning.text}${entryReasoning.text}`,
            },
            timestamp: entry.timestamp,
            seqEnd: entry.seqEnd,
            sourceSeqRanges: mergeSeqRanges(previous.sourceSeqRanges, entry.sourceSeqRanges),
            collapsed: Array.from(collapsedKinds),
        };
    }
    return output;
}
function mergeAssistantChunks(entries) {
    const output = [];
    for (const entry of entries) {
        const previous = output[output.length - 1];
        const shouldMerge = previous &&
            previous.item.type === "assistant_message" &&
            entry.item.type === "assistant_message" &&
            previous.seqEnd + 1 === entry.seqStart &&
            previous.turnId === entry.turnId;
        if (!shouldMerge || !previous) {
            output.push(entry);
            continue;
        }
        const previousAssistant = previous.item;
        const entryAssistant = entry.item;
        if (entryAssistant.messageId !== undefined &&
            previousAssistant.messageId !== entryAssistant.messageId) {
            output.push(entry);
            continue;
        }
        const collapsedKinds = new Set([
            ...previous.collapsed,
            ...entry.collapsed,
            "assistant_merge",
        ]);
        output[output.length - 1] = {
            ...previous,
            item: {
                type: "assistant_message",
                text: `${previousAssistant.text}${entryAssistant.text}`,
                ...(previousAssistant.messageId ? { messageId: previousAssistant.messageId } : {}),
            },
            timestamp: entry.timestamp,
            seqEnd: entry.seqEnd,
            sourceSeqRanges: mergeSeqRanges(previous.sourceSeqRanges, entry.sourceSeqRanges),
            collapsed: Array.from(collapsedKinds),
        };
    }
    return output;
}
/** Owns projected state; source events are consumed, never retained. */
export class TimelineProjection {
    constructor(rows = []) {
        this.rows = [];
        this.identities = new Map();
        this.lastAssistantRowIndex = null;
        // Disjoint source-coverage spans in display order. A tail starting inside a
        // span must include its first anchor to cover interleaved lifecycle updates.
        this.spans = [];
        this.sourceRanges = [];
        for (const row of rows)
            this.appendProjected(row);
        for (const [rowIndex, row] of this.rows.entries()) {
            for (const range of row.sourceSeqRanges)
                this.sourceRanges.push({ ...range, rowIndex });
        }
        this.sourceRanges.sort((a, b) => a.startSeq - b.startSeq);
    }
    append(row) {
        const rowIndex = this.appendProjected(row);
        const last = this.sourceRanges.at(-1);
        if (last && last.rowIndex === rowIndex && last.endSeq + 1 === row.seq) {
            last.endSeq = row.seq;
        }
        else {
            this.sourceRanges.push({ startSeq: row.seq, endSeq: row.seq, rowIndex });
        }
        return { ...this.rows[rowIndex] };
    }
    appendProjected(row) {
        const entry = makeCanonicalEntries([row])[0];
        const identity = timelineItemIdentity(row.item);
        const index = identity === null ? undefined : this.identities.get(identity);
        const existing = index === undefined ? undefined : this.rows[index];
        const merged = existing ? mergeIdentityEntries(existing, entry) : null;
        if (merged && index !== undefined) {
            this.rows[index] = { ...merged, seq: merged.seqEnd };
            this.extendSpan(index);
            return index;
        }
        const previous = this.rows.at(-1);
        const adjacent = previous
            ? mergeReasoningChunks(mergeAssistantChunks([previous, entry]))
            : [entry];
        if (previous && adjacent.length === 1) {
            const mergedText = adjacent[0];
            this.rows[this.rows.length - 1] = { ...mergedText, seq: mergedText.seqEnd };
            this.extendSpan(this.rows.length - 1);
            return this.rows.length - 1;
        }
        if (identity !== null)
            this.identities.set(identity, this.rows.length);
        if (entry.item.type === "assistant_message")
            this.lastAssistantRowIndex = this.rows.length;
        this.rows.push({ ...entry, seq: entry.seqEnd });
        const last = this.spans.at(-1);
        if (last && last.endSeq >= entry.seqStart) {
            last.endSeq = Math.max(last.endSeq, entry.seqEnd);
        }
        else {
            this.spans.push({ start: this.rows.length - 1, endSeq: entry.seqEnd });
        }
        return this.rows.length - 1;
    }
    spanIndex(rowIndex) {
        let low = 0;
        let high = this.spans.length;
        while (low + 1 < high) {
            const middle = (low + high) >>> 1;
            if (this.spans[middle].start <= rowIndex)
                low = middle;
            else
                high = middle;
        }
        return low;
    }
    extendSpan(rowIndex) {
        const index = this.spanIndex(rowIndex);
        const span = this.spans[index];
        span.endSeq = Math.max(span.endSeq, this.rows[rowIndex].seqEnd);
        let end = index + 1;
        while (end < this.spans.length && this.rows[this.spans[end].start].seqStart <= span.endSeq) {
            span.endSeq = Math.max(span.endSeq, this.spans[end].endSeq);
            end++;
        }
        this.spans.splice(index + 1, end - index - 1);
    }
    getRows() {
        return this.rows.map((row) => ({ ...row }));
    }
    selectPage(input) {
        if (this.rows.length === 0) {
            const cursor = input.cursorSeq ??
                (input.direction === "before" ? input.bounds.maxSeq + 1 : input.bounds.minSeq - 1);
            return {
                entries: [],
                startSeq: null,
                endSeq: null,
                hasOlder: input.direction === "after"
                    ? cursor >= input.bounds.minSeq
                    : input.direction === "before" && cursor > input.bounds.minSeq,
                hasNewer: input.direction === "after"
                    ? cursor < input.bounds.maxSeq
                    : input.direction === "before" && cursor <= input.bounds.maxSeq,
            };
        }
        switch (input.direction) {
            case "tail":
                return this.selectTail(input);
            case "after":
                return this.selectAfter(input);
            case "before":
                return this.selectBefore(input);
        }
    }
    selectTail(input) {
        const limit = Math.max(0, Math.floor(input.limit ?? 0));
        const requestedStart = limit === 0 ? 0 : Math.max(0, this.rows.length - limit);
        const coveredStart = this.spans[this.spanIndex(requestedStart)].start;
        const start = input.wholeTurns ? this.wholeTurnWindowStart(coveredStart) : coveredStart;
        return {
            entries: this.rows.slice(start),
            startSeq: this.rows[start].seqStart,
            endSeq: input.bounds.maxSeq,
            hasOlder: start > 0,
            hasNewer: false,
        };
    }
    wholeTurnWindowStart(requestedStart) {
        let start = requestedStart;
        for (;;) {
            while (start > 0 && continuesProjectedTurn(this.rows[start - 1], this.rows[start]))
                start--;
            // Source coverage can pull in an earlier tool and therefore its entire run.
            const coveredStart = this.spans[this.spanIndex(start)].start;
            if (coveredStart === start)
                return start;
            start = coveredStart;
        }
    }
    selectAfter(input) {
        const startSeq = Math.max(input.bounds.minSeq, (input.cursorSeq ?? input.bounds.minSeq - 1) + 1);
        let low = 0;
        let high = this.sourceRanges.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (this.sourceRanges[middle].endSeq < startSeq)
                low = middle + 1;
            else
                high = middle;
        }
        const indexes = new Set();
        const limit = Math.max(0, Math.floor(input.limit ?? 0));
        for (let i = low; i < this.sourceRanges.length; i++) {
            const range = this.sourceRanges[i];
            if (range.startSeq > input.bounds.maxSeq)
                break;
            indexes.add(range.rowIndex);
            if (limit > 0 && indexes.size === limit)
                break;
        }
        const entries = [...indexes].sort((a, b) => a - b).map((index) => this.rows[index]);
        const selected = selectProjectedEntriesAfter({
            entries,
            startSeq,
            maxSeq: input.bounds.maxSeq,
            limit,
        });
        return {
            entries: selected.entries,
            startSeq: selected.endSeq === null ? null : startSeq,
            endSeq: selected.endSeq,
            hasOlder: startSeq > input.bounds.minSeq,
            hasNewer: selected.endSeq !== null && selected.endSeq < input.bounds.maxSeq,
        };
    }
    selectBefore(input) {
        const endSeq = Math.min(input.bounds.maxSeq, (input.cursorSeq ?? input.bounds.maxSeq + 1) - 1);
        if (endSeq >= input.bounds.minSeq) {
            let low = 0;
            let high = this.rows.length;
            while (low < high) {
                const middle = (low + high) >>> 1;
                if (this.rows[middle].seqStart <= endSeq)
                    low = middle + 1;
                else
                    high = middle;
            }
            const limit = Math.max(0, Math.floor(input.limit ?? 0));
            const requestedStart = limit === 0 ? 0 : Math.max(0, low - limit);
            const start = input.wholeTurns ? this.wholeTurnWindowStart(requestedStart) : requestedStart;
            // Choose the window before extending the right edge, so a prompt jump
            // cannot lose its target when the next turn is arbitrarily large.
            if (input.wholeTurns) {
                while (low < this.rows.length && continuesProjectedTurn(this.rows[low - 1], this.rows[low]))
                    low++;
            }
            let selectedEnd = endSeq;
            if (input.wholeTurns)
                selectedEnd = low === this.rows.length ? input.bounds.maxSeq : this.rows[low].seqStart - 1;
            return {
                entries: this.rows.slice(start, low),
                startSeq: this.rows[start]?.seqStart ?? null,
                endSeq: selectedEnd,
                hasOlder: start > 0,
                hasNewer: selectedEnd < input.bounds.maxSeq,
            };
        }
        return { entries: [], startSeq: null, endSeq: null, hasOlder: false, hasNewer: true };
    }
    getLastItem(seq) {
        const last = this.sourceRanges.at(-1);
        return last?.endSeq === seq ? this.rows[last.rowIndex].item : null;
    }
    getLastAssistantMessage() {
        const row = this.lastAssistantRowIndex === null ? null : this.rows[this.lastAssistantRowIndex];
        return row?.item.type === "assistant_message" ? row.item.text : null;
    }
    enrichSubmittedUserMessage(clientMessageId, providerMessageId) {
        const index = this.rows.findIndex((row) => row.item.type === "user_message" && row.item.clientMessageId === clientMessageId);
        if (index < 0)
            return null;
        this.rows[index] = { ...this.rows[index], providerMessageId };
        return { ...this.rows[index] };
    }
}
export function projectTimelineRows(input) {
    const canonical = makeCanonicalEntries(input.rows);
    if (input.mode === "canonical") {
        return canonical;
    }
    const toolCollapsed = collapseByIdentity(canonical);
    const assistantMerged = mergeAssistantChunks(toolCollapsed);
    return mergeReasoningChunks(assistantMerged);
}
/**
 * Select a timeline window based on projected-entry count, then map it back to
 * contiguous canonical rows. This avoids cutting through merged assistant
 * chunks when callers request canonical rows with a bounded limit.
 */
export function selectTimelineWindowByProjectedLimit(input) {
    const { rows, direction } = input;
    const limit = Math.max(0, Math.floor(input.limit));
    const canonical = makeCanonicalEntries(rows);
    const projectedAll = mergeReasoningChunks(mergeAssistantChunks(collapseByIdentity(canonical)));
    if (projectedAll.length === 0) {
        return {
            projectedEntries: [],
            selectedRows: [],
            minSeq: null,
            maxSeq: null,
        };
    }
    let projectedEntries;
    if (limit === 0 || limit >= projectedAll.length) {
        projectedEntries = projectedAll;
    }
    else if (direction === "after") {
        projectedEntries = projectedAll.slice(0, limit);
    }
    else {
        projectedEntries = projectedAll.slice(projectedAll.length - limit);
    }
    if (projectedEntries.length === 0) {
        return {
            projectedEntries: [],
            selectedRows: [],
            minSeq: null,
            maxSeq: null,
        };
    }
    const computeWindowBounds = (entries) => {
        let minSeq = Number.POSITIVE_INFINITY;
        let maxSeq = Number.NEGATIVE_INFINITY;
        for (const entry of entries) {
            if (entry.seqStart < minSeq) {
                minSeq = entry.seqStart;
            }
            if (entry.seqEnd > maxSeq) {
                maxSeq = entry.seqEnd;
            }
        }
        return { minSeq, maxSeq };
    };
    let { minSeq, maxSeq } = computeWindowBounds(projectedEntries);
    let expandedEntries = projectedEntries;
    // Expand to include any projected entries that overlap the selected canonical
    // range. Tool lifecycle collapse can produce non-monotonic seqEnd values,
    // which would otherwise create cursor gaps.
    for (let iteration = 0; iteration < projectedAll.length + 1; iteration += 1) {
        const overlapping = projectedAll.filter((entry) => entry.seqStart <= maxSeq && entry.seqEnd >= minSeq);
        const nextBounds = computeWindowBounds(overlapping);
        if (overlapping.length === expandedEntries.length &&
            nextBounds.minSeq === minSeq &&
            nextBounds.maxSeq === maxSeq) {
            expandedEntries = overlapping;
            break;
        }
        expandedEntries = overlapping;
        minSeq = nextBounds.minSeq;
        maxSeq = nextBounds.maxSeq;
    }
    const selectedRows = rows.filter((row) => row.seq >= minSeq && row.seq <= maxSeq);
    return {
        projectedEntries: expandedEntries,
        selectedRows,
        minSeq: Number.isFinite(minSeq) ? minSeq : null,
        maxSeq: Number.isFinite(maxSeq) ? maxSeq : null,
    };
}
function firstSourceSeqInRange(entry, startSeq, endSeq) {
    for (const range of entry.sourceSeqRanges) {
        const firstSeq = Math.max(range.startSeq, startSeq);
        if (firstSeq <= Math.min(range.endSeq, endSeq))
            return firstSeq;
    }
    return null;
}
function selectProjectedEntriesAfter(input) {
    const eligible = input.entries
        .map((entry, index) => ({
        entry,
        index,
        firstSourceSeq: firstSourceSeqInRange(entry, input.startSeq, input.maxSeq),
    }))
        .filter((candidate) => candidate.firstSourceSeq !== null)
        .sort((left, right) => left.firstSourceSeq - right.firstSourceSeq || left.index - right.index);
    const selected = input.limit === 0 ? eligible : eligible.slice(0, input.limit);
    const selectedEntries = selected
        .sort((left, right) => left.index - right.index)
        .map((candidate) => candidate.entry);
    if (selectedEntries.length === 0)
        return { entries: [], endSeq: null };
    const selectedRanges = selectedEntries
        .flatMap((entry) => entry.sourceSeqRanges)
        .sort((left, right) => left.startSeq - right.startSeq || left.endSeq - right.endSeq);
    // Wide projected entries can include future, discontiguous source ranges. The
    // page cursor advances only through source rows covered without a gap.
    let endSeq = input.startSeq - 1;
    for (const range of selectedRanges) {
        if (range.endSeq <= endSeq)
            continue;
        if (range.startSeq > endSeq + 1)
            break;
        endSeq = Math.min(range.endSeq, input.maxSeq);
    }
    return {
        entries: selectedEntries,
        endSeq: endSeq >= input.startSeq ? endSeq : null,
    };
}
function continuesProjectedTurn(previous, next) {
    return continuesTimelineTurn(previous.turnId, next.turnId, isTimelineTurnTrigger(next.item));
}
export function selectItemsByProjectedLimit(input) {
    const rows = input.items.map((item, index) => ({
        seq: index + 1,
        timestamp: "",
        item,
    }));
    const projectedAll = projectTimelineRows({ rows, mode: "projected" });
    const window = selectTimelineWindowByProjectedLimit({
        rows,
        direction: input.direction,
        limit: input.limit,
    });
    return {
        items: window.selectedRows.map((row) => row.item),
        totalProjected: projectedAll.length,
        shownProjected: window.projectedEntries.length,
    };
}
//# sourceMappingURL=timeline-projection.js.map