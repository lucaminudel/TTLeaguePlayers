import { describe, expect, it } from 'vitest';
import { frontendException } from '../../../../src/service/frontend-diagnostics/FrontendDiagnostics';

describe('frontendException', () => {
    it('serializes an Error with its name, message and stack trace', () => {
        const error = new TypeError('Invalid response');
        error.stack = 'TypeError: Invalid response\n    at parser';

        expect(frontendException(error)).toStrictEqual({
            name: 'TypeError',
            message: 'Invalid response',
            stackTrace: 'TypeError: Invalid response\n    at parser',
        });
    });

    it('retains the stackTrace property when an Error has no stack', () => {
        const error = new Error('No stack');
        error.stack = undefined;

        expect(frontendException(error)).toStrictEqual({
            name: 'Error',
            message: 'No stack',
            stackTrace: undefined,
        });
    });

    it.each([
        ['text', 'text'],
        [42, '42'],
        [false, 'false'],
        [null, 'null'],
        [undefined, 'undefined'],
        [{ detail: 'failure' }, '[object Object]'],
    ])('serializes non-Error value %s using String', (value, message) => {
        expect(frontendException(value)).toStrictEqual({ message });
    });
});
