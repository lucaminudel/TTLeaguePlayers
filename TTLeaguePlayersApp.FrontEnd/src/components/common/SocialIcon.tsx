import React from 'react';
import type { IconDefinition } from '@fortawesome/free-brands-svg-icons';

export interface SocialIconProps {
  icon: IconDefinition;
}

/**
 * Renders a Font Awesome icon definition as an inline SVG, without pulling in
 * the `@fortawesome/fontawesome-svg-core` renderer (~92 kB of the bundle).
 *
 * The inline styles reproduce what the core's injected stylesheet applies to
 * `.svg-inline--fa.fa-lg`, so the output is visually identical to the
 * `<FontAwesomeIcon icon={...} size="lg" />` it replaces:
 * a uniform 1.25em-wide box with the glyph centred inside it.
 */
export const SocialIcon: React.FC<SocialIconProps> = ({ icon }) => {
  const [width, height, , , pathData] = icon.icon;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={[0, 0, width, height].join(' ')}
      aria-hidden="true"
      focusable="false"
      style={{
        display: 'inline-block',
        fontSize: '1.25em',
        width: '1.25em',
        height: '1em',
        verticalAlign: '-0.2em',
        boxSizing: 'content-box',
        overflow: 'visible',
      }}
    >
      <path fill="currentColor" d={pathData as string} />
    </svg>
  );
};
