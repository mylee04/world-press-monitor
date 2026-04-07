'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const LANDING_MODE_CLASS = 'landing-header-mode';
const LANDING_VISIBLE_CLASS = 'landing-header-visible';
const LANDING_SCROLL_THRESHOLD = 4;

function readScrollTop(): number {
  return Math.max(
    window.scrollY || 0,
    document.documentElement.scrollTop || 0,
    document.body.scrollTop || 0
  );
}

export function SiteHeaderVisibilityController() {
  const pathname = usePathname();

  useEffect(() => {
    let forceVisibleAtTop = false;

    const syncHeaderState = () => {
      const { body } = document;

      if (pathname !== '/') {
        body.classList.remove(LANDING_MODE_CLASS, LANDING_VISIBLE_CLASS);
        return;
      }

      body.classList.add(LANDING_MODE_CLASS);
      body.classList.toggle(LANDING_VISIBLE_CLASS, forceVisibleAtTop || readScrollTop() > LANDING_SCROLL_THRESHOLD);
    };

    const revealHeaderByIntent = () => {
      if (pathname !== '/') {
        return;
      }

      if (!forceVisibleAtTop) {
        forceVisibleAtTop = true;
      }

      syncHeaderState();
    };

    syncHeaderState();

    if (pathname !== '/') {
      return;
    }

    let frameId = 0;

    const updateOnScroll = () => {
      if (frameId !== 0) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        syncHeaderState();
      });
    };

    window.addEventListener('scroll', updateOnScroll, { passive: true });
    document.addEventListener('scroll', updateOnScroll, { passive: true, capture: true });
    window.addEventListener('resize', updateOnScroll);
    window.addEventListener('wheel', revealHeaderByIntent, { passive: true });
    window.addEventListener('touchmove', revealHeaderByIntent, { passive: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'PageDown' ||
        event.key === 'PageUp' ||
        event.key === ' '
      ) {
        revealHeaderByIntent();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }

      window.removeEventListener('scroll', updateOnScroll);
      document.removeEventListener('scroll', updateOnScroll, true);
      window.removeEventListener('resize', updateOnScroll);
      window.removeEventListener('wheel', revealHeaderByIntent);
      window.removeEventListener('touchmove', revealHeaderByIntent);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.classList.remove(LANDING_MODE_CLASS, LANDING_VISIBLE_CLASS);
    };
  }, [pathname]);

  return null;
}
