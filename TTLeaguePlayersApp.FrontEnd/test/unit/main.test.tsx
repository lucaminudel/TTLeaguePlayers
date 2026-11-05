import { StrictMode, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createRootMock, renderMock } = vi.hoisted(() => {
    const renderMock = vi.fn();
    const root = { render: renderMock };
    return { createRootMock: vi.fn(() => root), renderMock };
});

vi.mock('react-dom/client', () => ({ createRoot: createRootMock }));
vi.mock('../../src/App.tsx', () => ({ default: () => null }));

describe('frontend bootstrap', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        document.body.replaceChildren();
    });

    it('mounts the application in StrictMode when the root element exists', async () => {
        const rootElement = document.createElement('div');
        rootElement.id = 'root';
        document.body.append(rootElement);

        await import('../../src/main.tsx');

        expect(createRootMock).toHaveBeenCalledWith(rootElement);
        expect(renderMock).toHaveBeenCalledOnce();
        const appTree = renderMock.mock.calls[0][0] as ReactElement<{ children?: ReactNode }>;
        expect(appTree.type).toBe(StrictMode);
        expect(appTree.props.children).toBeDefined();
    }, 15000);

    it('does not try to mount when the root element is missing', async () => {
        await import('../../src/main.tsx');

        expect(createRootMock).not.toHaveBeenCalled();
        expect(renderMock).not.toHaveBeenCalled();
    }, 15000);
});
