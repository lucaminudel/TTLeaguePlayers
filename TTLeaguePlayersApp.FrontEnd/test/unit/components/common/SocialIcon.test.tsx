import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { faInstagram } from '@fortawesome/free-brands-svg-icons';
import { SocialIcon } from '../../../../src/components/common/SocialIcon';

describe('SocialIcon', () => {
    it('renders the selected brand glyph as a decorative inline SVG with its sizing contract', () => {
        const { container } = render(<SocialIcon icon={faInstagram} />);
        const svg = container.querySelector('svg');

        expect(svg).not.toBeNull();
        expect(svg).toHaveAttribute('xmlns', 'http://www.w3.org/2000/svg');
        expect(svg).toHaveAttribute('viewBox', `0 0 ${String(faInstagram.icon[0])} ${String(faInstagram.icon[1])}`);
        expect(svg).toHaveAttribute('aria-hidden', 'true');
        expect(svg).toHaveAttribute('focusable', 'false');
        expect(svg).toHaveStyle({
            display: 'inline-block',
            fontSize: '1.25em',
            width: '1.25em',
            height: '1em',
            verticalAlign: '-0.2em',
            boxSizing: 'content-box',
            overflow: 'visible',
        });

        const path = svg?.querySelector('path');
        expect(path).toHaveAttribute('fill', 'currentColor');
        expect(path).toHaveAttribute('d', faInstagram.icon[4] as string);
    });
});
