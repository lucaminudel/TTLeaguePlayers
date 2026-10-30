import { sendFrontendEvent } from '../../api/frontendEventsApi';
import type { FrontendDiagnostic, FrontendDiagnosticDelivery } from '../../types/frontendDiagnostic';

const QUEUE_KEY = 'frontend_event_queue';
const QUEUE_VERSION = 1;
const MAX_ENTRIES = 20;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const DRAIN_COOLDOWN_MS = 5000;

interface QueueEntry {
    id: string;
    queuedAt: number;
    diagnostic: FrontendDiagnostic;
}

function isQueueEntry(entry: unknown): entry is QueueEntry {
    if (entry === null || typeof entry !== 'object') return false;
    const candidate = entry as Partial<QueueEntry>;
    return typeof candidate.id === 'string' && typeof candidate.queuedAt === 'number' &&
        typeof candidate.diagnostic === 'object';
}

let draining = false;
let lastDrainStarted: number | undefined;

function readQueue(): QueueEntry[] {
    const stored = localStorage.getItem(QUEUE_KEY);
    if (!stored) return [];
    try {
        const parsed: unknown = JSON.parse(stored);
        if (!parsed || typeof parsed !== 'object' || !('version' in parsed) || parsed.version !== QUEUE_VERSION ||
            !('entries' in parsed) || !Array.isArray(parsed.entries)) {
            localStorage.removeItem(QUEUE_KEY);
            return [];
        }
        return parsed.entries.filter(isQueueEntry)
            .filter(entry => Date.now() - entry.queuedAt < MAX_AGE_MS)
            .slice(-MAX_ENTRIES);
    } catch {
        localStorage.removeItem(QUEUE_KEY);
        return [];
    }
}

function writeQueue(entries: QueueEntry[]): void {
    localStorage.setItem(QUEUE_KEY, JSON.stringify({ version: QUEUE_VERSION, entries: entries.slice(-MAX_ENTRIES) }));
}

function isPermanentFailure(result: FrontendDiagnosticDelivery): boolean {
    const status = result.status;
    return status !== undefined && status >= 400 && status < 500 && status !== 401 && status !== 403 && status !== 429;
}

async function drainSnapshot(snapshot: QueueEntry[]): Promise<void> {
    if (snapshot.length === 0 || draining || (lastDrainStarted !== undefined && Date.now() - lastDrainStarted < DRAIN_COOLDOWN_MS)) return;
    draining = true;
    lastDrainStarted = Date.now();
    try {
        for (const entry of snapshot) {
            let result: FrontendDiagnosticDelivery;
            try {
                result = await sendFrontendEvent({ ...entry.diagnostic, deferred: true });
            } catch {
                continue;
            }
            if (result.success || isPermanentFailure(result)) {
                writeQueue(readQueue().filter(queued => queued.id !== entry.id));
            } else if (result.status === 401 || result.status === 403) {
                break;
            }
        }
    } catch {
        // Storage failures must not affect the original application operation.
    } finally {
        draining = false;
    }
}

export async function drainFrontendEvents(): Promise<void> {
    try {
        const entries = readQueue();
        writeQueue(entries);
        await drainSnapshot(entries);
    } catch {
        // Delivery is best effort when localStorage is unavailable.
    }
}

export async function submitFrontendEvent(diagnostic: FrontendDiagnostic): Promise<void> {
    let snapshot: QueueEntry[] = [];
    try {
        snapshot = readQueue();
        writeQueue(snapshot);
    } catch {
        // An unavailable queue must not prevent the immediate attempt.
    }

    let result: FrontendDiagnosticDelivery;
    try {
        const immediate = sendFrontendEvent(diagnostic);
        void drainSnapshot(snapshot);
        result = await immediate;
    } catch {
        void drainSnapshot(snapshot);
        result = { success: false };
    }
    if (!result.success) {
        try {
            writeQueue([...readQueue(), { id: crypto.randomUUID(), queuedAt: Date.now(), diagnostic }]);
        } catch {
            // A failed write loses this diagnostic but does not affect the application.
        }
    }
}
