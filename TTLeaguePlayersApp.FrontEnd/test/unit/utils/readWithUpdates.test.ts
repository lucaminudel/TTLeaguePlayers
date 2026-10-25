import { expect, it, vi } from 'vitest';
import { readWithUpdates } from '../../../src/utils/CacheUtils';

it('shows the cached read, then a completed refresh', async () => {
    let refresh!: (data: string[]) => void;
    const display = vi.fn();
    await readWithUpdates((update) => { refresh = update; return Promise.resolve(['cached']); }, display, () => true);
    expect(display).toHaveBeenLastCalledWith(['cached']);
    refresh(['fresh']);
    expect(display).toHaveBeenLastCalledWith(['fresh']);
});

it('does not overwrite a fast refresh with the initial stale result', async () => {
    const display = vi.fn();
    await readWithUpdates((update) => { update(['fresh']); return Promise.resolve(['stale']); }, display, () => true);
    expect(display).toHaveBeenCalledExactlyOnceWith(['fresh']);
});

it('ignores late initial reads and refreshes after cleanup or supersession', async () => {
    let current = true;
    let refresh!: (data: string[]) => void;
    let resolveRead!: (data: string[]) => void;
    const display = vi.fn();
    const pending = readWithUpdates((update) => {
        refresh = update;
        return new Promise<string[]>((resolve) => { resolveRead = resolve; });
    }, display, () => current);
    current = false;
    resolveRead(['cached']);
    await pending;
    refresh(['fresh']);
    expect(display).not.toHaveBeenCalled();
});
