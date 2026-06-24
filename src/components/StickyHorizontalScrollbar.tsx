import { useEffect, useRef, useState, RefObject } from 'react';

/**
 * Renders a horizontal scrollbar fixed at the bottom of the viewport that
 * stays in sync with `targetRef` (a horizontally-scrollable container).
 * The bar only appears when the target overflows horizontally AND the
 * target's own scrollbar is not currently visible in the viewport.
 */
export function StickyHorizontalScrollbar({
  targetRef,
}: {
  targetRef: RefObject<HTMLElement>;
}) {
  const proxyRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const [left, setLeft] = useState(0);
  const [scrollWidth, setScrollWidth] = useState(0);

  useEffect(() => {
    const target = targetRef.current;
    const proxy = proxyRef.current;
    if (!target || !proxy) return;

    const update = () => {
      const rect = target.getBoundingClientRect();
      const overflows = target.scrollWidth > target.clientWidth + 1;
      const targetBottom = rect.bottom;
      const viewportH = window.innerHeight;
      // Show our sticky bar only when target overflows AND its native
      // scrollbar is below the viewport (i.e. user can't see it).
      const targetBarBelowViewport = targetBottom > viewportH;
      setVisible(overflows && targetBarBelowViewport);
      setWidth(rect.width);
      setLeft(rect.left);
      setScrollWidth(target.scrollWidth);
      if (innerRef.current) {
        innerRef.current.style.width = `${target.scrollWidth}px`;
      }
      if (!syncingRef.current) {
        proxy.scrollLeft = target.scrollLeft;
      }
    };

    const onTargetScroll = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      proxy.scrollLeft = target.scrollLeft;
      syncingRef.current = false;
    };

    const onProxyScroll = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      target.scrollLeft = proxy.scrollLeft;
      syncingRef.current = false;
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(target);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    target.addEventListener('scroll', onTargetScroll);
    proxy.addEventListener('scroll', onProxyScroll);

    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      target.removeEventListener('scroll', onTargetScroll);
      proxy.removeEventListener('scroll', onProxyScroll);
    };
  }, [targetRef]);

  return (
    <div
      ref={proxyRef}
      className="always-show-scrollbar"
      style={{
        position: 'fixed',
        bottom: 0,
        left,
        width,
        height: 14,
        overflowX: 'scroll',
        overflowY: 'hidden',
        zIndex: 40,
        background: 'hsl(var(--muted))',
        borderTop: '1px solid hsl(var(--border))',
        pointerEvents: visible ? 'auto' : 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.15s',
      }}
    >
      <div ref={innerRef} style={{ width: scrollWidth, height: 1 }} />
    </div>
  );
}
