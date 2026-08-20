'use client';

import { forwardRef } from 'react';
import { TEXT_BLOCKS, shadowToCss } from '@/app/lib/sceneConfig';
import { useSceneControls } from '@/app/lib/SceneControlsContext';

/**
 * Renders the 5 scroll-timed text blocks. Opacity is NOT driven by
 * React state (would re-render every scroll frame) — Section1's
 * rAF loop writes `style.opacity` directly onto these refs each
 * frame via `blockRefs`. See app/lib/scrollTimeline.ts for the math
 * and app/lib/sceneConfig.ts TEXT_BLOCKS for position/size/timing.
 */
const ScrollTextBlocks = forwardRef<HTMLDivElement[], object>(function ScrollTextBlocks(_props, ref) {
  const { textBlockFontSizeMultiplier, textBlockShadowSizeMultiplier, textBlockShadowIntensityMultiplier } =
    useSceneControls();
  return (
    <>
      {TEXT_BLOCKS.map((block, i) => {
        const transformOrigin =
          block.textAlign === 'left' ? 'top left' : block.textAlign === 'right' ? 'top right' : 'top center';
        return (
          <div
            key={block.id}
            ref={(el) => {
              if (!ref || typeof ref === 'function') return;
              if (el && ref.current) ref.current[i] = el;
            }}
            style={{
              position: 'absolute',
              zIndex: 10,
              opacity: 0,
              pointerEvents: 'none',
              userSelect: 'none',
              textAlign: block.textAlign,
              color: block.color,
              fontFamily: 'var(--font-michroma), sans-serif',
              fontSize: block.fontSizeClamp,
              letterSpacing: block.letterSpacing,
              lineHeight: 1.6,
              textShadow: shadowToCss(block.shadow, textBlockShadowSizeMultiplier, textBlockShadowIntensityMultiplier),
              transform: `scale(${textBlockFontSizeMultiplier})`,
              transformOrigin,
              ...block.position,
            }}
          >
            {block.lines.map((line, li) => (
              <div key={li}>{line}</div>
            ))}
          </div>
        );
      })}
    </>
  );
});

export default ScrollTextBlocks;
