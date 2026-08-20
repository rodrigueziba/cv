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
  // Note: transform:scale() also scales text-shadow, so this isn't fully
  // independent from textBlockShadowSizeMultiplier — both compound together visually.
  const { textBlockFontSizeMultiplier, textBlockShadowSizeMultiplier, textBlockShadowIntensityMultiplier, textBlockAlignment } =
    useSceneControls();
  return (
    <>
      {TEXT_BLOCKS.map((block, i) => {
        const transformOrigin =
          textBlockAlignment === 'left' ? 'top left' : textBlockAlignment === 'right' ? 'top right' : 'top center';
        // block.position may already carry its own transform (e.g. block-3's
        // translateX(-50%) centering); combine rather than let the spread
        // below clobber it. Translate first so centering stays correct at
        // any scale value.
        const positionTransform = block.position.transform;
        const combinedTransform = positionTransform
          ? `${positionTransform} scale(${textBlockFontSizeMultiplier})`
          : `scale(${textBlockFontSizeMultiplier})`;
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
              textAlign: textBlockAlignment,
              // text-align: justify never stretches a block's LAST line by
              // default — and since each line here is already its own
              // separate <div> (see the .map below), every line IS the last
              // line of its own box. text-align-last forces it to justify too.
              textAlignLast: textBlockAlignment === 'justify' ? 'justify' : undefined,
              color: block.color,
              fontFamily: 'var(--font-michroma), sans-serif',
              fontSize: block.fontSizeClamp,
              letterSpacing: block.letterSpacing,
              lineHeight: 1.6,
              textShadow: shadowToCss(block.shadow, textBlockShadowSizeMultiplier, textBlockShadowIntensityMultiplier),
              transformOrigin,
              ...block.position,
              transform: combinedTransform, // explicitly last — overrides any block.position.transform, combining it with the scale instead of losing it
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
