'use client';

import { forwardRef, useLayoutEffect, useRef, useState } from 'react';
import { TEXT_BLOCKS, MOBILE_CONFIG, shadowToCss } from '@/app/lib/sceneConfig';
import { useSceneControls } from '@/app/lib/SceneControlsContext';
import { useIsMobile } from '@/app/lib/mobileDetect';

const { sideMarginPercent, topMarginPercent, gapAroundButtonPercent } = MOBILE_CONFIG.textSafeArea;
const { portraitBottomPercent, landscapeRightPercent } = MOBILE_CONFIG.sphereButton;

/**
 * Renders the 5 scroll-timed text blocks. Opacity is NOT driven by
 * React state (would re-render every scroll frame) — Section1's
 * rAF loop writes `style.opacity` directly onto these refs each
 * frame via `blockRefs`. See app/lib/scrollTimeline.ts for the math
 * and app/lib/sceneConfig.ts TEXT_BLOCKS for position/size/timing.
 *
 * On mobile (useIsMobile()), desktop's per-block edge-anchored
 * positioning (left-aligned upper-left, right-aligned upper-right,
 * etc.) is replaced by ONE shared, centered "safe zone" — see
 * MOBILE_CONFIG.textSafeArea — with an additional per-block shrink
 * scale computed via a real DOM measurement (useLayoutEffect below)
 * so long lines never overflow that zone regardless of viewport size
 * or the debug menu's font-size multiplier.
 */
const ScrollTextBlocks = forwardRef<HTMLDivElement[], object>(function ScrollTextBlocks(_props, ref) {
  const { textBlockFontSizeMultiplier, textBlockShadowSizeMultiplier, textBlockShadowIntensityMultiplier, textBlockAlignment } =
    useSceneControls();
  const isMobile = useIsMobile();
  const innerElsRef = useRef<(HTMLDivElement | null)[]>([]);
  const [mobileFitScale, setMobileFitScale] = useState<number[]>(() => TEXT_BLOCKS.map(() => 1));

  useLayoutEffect(() => {
    if (!isMobile) return;
    function measure() {
      // Portrait's safe-zone bottom boundary sits above the sphere-control
      // button (which is near the screen bottom there); landscape has no
      // such vertical constraint (the button moves to the side), so only
      // the top margin bounds it on that axis.
      const isPortrait = window.innerHeight >= window.innerWidth;
      const safeHeightPercent = isPortrait
        ? 100 - topMarginPercent - portraitBottomPercent - gapAroundButtonPercent
        : 100 - topMarginPercent * 2;
      const safeHeightPx = (safeHeightPercent / 100) * window.innerHeight;
      setMobileFitScale(
        TEXT_BLOCKS.map((_, i) => {
          const el = innerElsRef.current[i];
          if (!el) return 1;
          const naturalHeightPx = el.scrollHeight;
          // el's own layout width is already CSS-clamped to its .textSafeZone
          // parent's width (maxWidth: 100% on the inner div), so naturalWidthPx
          // is never more than the zone's width at scale 1 — but `transform:
          // scale()` inflates painted width right along with height, so a
          // width already sitting near that ceiling can still be pushed past
          // the zone's left/right margins by the SAME totalScale that's sized
          // purely for height. Reading the zone's own (untransformed)
          // getBoundingClientRect width, rather than recomputing the
          // side-margin percentages here, automatically tracks whatever the
          // zone's actual CSS resolves to (including the landscape override
          // below, which changes the right margin asymmetrically).
          const naturalWidthPx = el.scrollWidth;
          const zoneEl = el.parentElement;
          const safeWidthPx = zoneEl ? zoneEl.getBoundingClientRect().width : Infinity;
          if (naturalHeightPx <= 0 && naturalWidthPx <= 0) return 1;
          const scaleForHeight =
            naturalHeightPx > 0 ? safeHeightPx / (naturalHeightPx * textBlockFontSizeMultiplier) : 1;
          const scaleForWidth =
            naturalWidthPx > 0 ? safeWidthPx / (naturalWidthPx * textBlockFontSizeMultiplier) : 1;
          const scale = Math.min(scaleForHeight, scaleForWidth);
          return Math.max(0.3, Math.min(1, scale));
        })
      );
    }
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [isMobile, textBlockFontSizeMultiplier]);

  return (
    <>
      {/* The landscape override below also resets `bottom` to the plain
          top-margin value (not the portrait button-clearance value) so the
          CSS box's actual height matches what measure()'s isPortrait branch
          assumes (100 - topMarginPercent*2) — otherwise the safe-zone box
          would keep a large, unnecessary bottom gap in landscape even
          though the sphere-control button has moved to the side. */}
      {isMobile && (
        <style>{`
          @media (orientation: landscape) {
            .textSafeZone {
              right: ${landscapeRightPercent + gapAroundButtonPercent}% !important;
              bottom: ${topMarginPercent}% !important;
            }
          }
        `}</style>
      )}
      {TEXT_BLOCKS.map((block, i) => {
        const totalScale = textBlockFontSizeMultiplier * (isMobile ? mobileFitScale[i] : 1);
        const textStyle = {
          textAlign: textBlockAlignment,
          // text-align: justify never stretches a block's LAST line by
          // default — and since each line here is already its own
          // separate <div> (see the .map below), every line IS the last
          // line of its own box. text-align-last forces it to justify too.
          textAlignLast: textBlockAlignment === 'justify' ? ('justify' as const) : undefined,
          color: block.color,
          fontFamily: 'var(--font-michroma), sans-serif',
          fontSize: block.fontSizeClamp,
          letterSpacing: block.letterSpacing,
          lineHeight: 1.6,
          textShadow: shadowToCss(block.shadow, textBlockShadowSizeMultiplier, textBlockShadowIntensityMultiplier),
        };

        if (isMobile) {
          return (
            <div
              key={block.id}
              className="textSafeZone"
              style={{
                position: 'absolute',
                zIndex: 10,
                top: `${topMarginPercent}%`,
                bottom: `${portraitBottomPercent + gapAroundButtonPercent}%`,
                left: `${sideMarginPercent}%`,
                right: `${sideMarginPercent}%`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <div
                ref={(el) => {
                  innerElsRef.current[i] = el;
                  if (!ref || typeof ref === 'function') return;
                  if (el && ref.current) ref.current[i] = el;
                }}
                style={{
                  opacity: 0,
                  userSelect: 'none',
                  transformOrigin: 'center',
                  transform: `scale(${totalScale})`,
                  // Flex items default to a content-based min-width (roughly
                  // max-content) that overrides flex-shrink, so without this
                  // the block would never shrink below its widest pre-split
                  // line's natural width — silently busting the safe zone's
                  // side margins for any line wider than ~70vw instead of
                  // actually wrapping to fit it. minWidth: 0 opts back into
                  // normal shrink-to-fit-container behavior (standard fix for
                  // text overflowing a flex item).
                  minWidth: 0,
                  maxWidth: '100%',
                  ...textStyle,
                }}
              >
                {block.lines.map((line, li) => (
                  <div key={li}>{line}</div>
                ))}
              </div>
            </div>
          );
        }

        // Desktop — unchanged from before this task.
        const transformOrigin =
          textBlockAlignment === 'left' ? 'top left' : textBlockAlignment === 'right' ? 'top right' : 'top center';
        const positionTransform = block.position.transform;
        const combinedTransform = positionTransform
          ? `${positionTransform} scale(${totalScale})`
          : `scale(${totalScale})`;
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
              transformOrigin,
              ...block.position,
              transform: combinedTransform, // explicitly last — overrides any block.position.transform, combining it with the scale instead of losing it
              ...textStyle,
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
