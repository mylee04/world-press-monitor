'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const LANDING_MODE_CLASS = 'landing-header-mode';
const LANDING_VISIBLE_CLASS = 'landing-header-visible';
const LANDING_SCROLL_THRESHOLD = 10;
const LANDING_SCROLL_DELTA = 2;
const LANDING_IDLE_HIDE_MS = 3000;

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
    let lastScrollTop = readScrollTop();
    let frameId = 0;
    let hideTimerId = 0;
    let touchStartY: number | null = null;
    let headerHovered = false;

    const clearHideTimer = () => {
      if (hideTimerId !== 0) {
        window.clearTimeout(hideTimerId);
        hideTimerId = 0;
      }
    };

    const setHeaderVisible = (visible: boolean) => {
      const { body } = document;

      body.classList.add(LANDING_MODE_CLASS);
      body.classList.toggle(LANDING_VISIBLE_CLASS, visible);
    };

    const scheduleHide = () => {
      clearHideTimer();

      if (pathname !== '/' || headerHovered) {
        return;
      }

      if (!document.body.classList.contains(LANDING_VISIBLE_CLASS)) {
        return;
      }

      hideTimerId = window.setTimeout(() => {
        hideTimerId = 0;

        if (headerHovered) {
          return;
        }

        setHeaderVisible(false);
      }, LANDING_IDLE_HIDE_MS);
    };

    const syncHeaderState = () => {
      const { body } = document;

      if (pathname !== '/') {
        clearHideTimer();
        body.classList.remove(LANDING_MODE_CLASS, LANDING_VISIBLE_CLASS);
        return;
      }

      const currentScrollTop = readScrollTop();
      const isNearTop = currentScrollTop <= LANDING_SCROLL_THRESHOLD;
      const scrollDelta = currentScrollTop - lastScrollTop;
      const isScrollingUp = scrollDelta <= -LANDING_SCROLL_DELTA;
      const isScrollingDown = scrollDelta >= LANDING_SCROLL_DELTA;
      const isVisible = body.classList.contains(LANDING_VISIBLE_CLASS);

      body.classList.add(LANDING_MODE_CLASS);

      if (isNearTop && !isVisible) {
        clearHideTimer();
        body.classList.remove(LANDING_VISIBLE_CLASS);
      } else if (isScrollingUp) {
        body.classList.add(LANDING_VISIBLE_CLASS);
        scheduleHide();
      } else if ((isScrollingDown || isNearTop) && isVisible) {
        scheduleHide();
      }

      lastScrollTop = currentScrollTop;
    };

    const revealOnUpIntent = () => {
      if (pathname !== '/') {
        return;
      }

      const currentScrollTop = readScrollTop();

      if (currentScrollTop <= LANDING_SCROLL_THRESHOLD) {
        return;
      }

      setHeaderVisible(true);
      lastScrollTop = currentScrollTop;
      scheduleHide();
    };

    syncHeaderState();

    if (pathname !== '/') {
      return;
    }

    const updateOnScroll = () => {
      if (frameId !== 0) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        syncHeaderState();
      });
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY < -LANDING_SCROLL_DELTA) {
        revealOnUpIntent();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        revealOnUpIntent();
      }
    };

    const handleTouchStart = (event: TouchEvent) => {
      touchStartY = event.touches[0]?.clientY ?? null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const currentTouchY = event.touches[0]?.clientY;

      if (touchStartY === null || currentTouchY === undefined) {
        return;
      }

      if (currentTouchY - touchStartY > LANDING_SCROLL_DELTA) {
        revealOnUpIntent();
      }
    };

    const resetTouchStart = () => {
      touchStartY = null;
    };

    const headerElement = document.querySelector<HTMLElement>('.site-header');

    const handleHeaderMouseEnter = () => {
      headerHovered = true;
      clearHideTimer();
    };

    const handleHeaderMouseLeave = () => {
      headerHovered = false;
      scheduleHide();
    };

    window.addEventListener('scroll', updateOnScroll, { passive: true });
    document.addEventListener('scroll', updateOnScroll, { passive: true, capture: true });
    window.addEventListener('resize', updateOnScroll);
    window.addEventListener('wheel', handleWheel, { passive: true });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', resetTouchStart, { passive: true });
    window.addEventListener('touchcancel', resetTouchStart, { passive: true });
    headerElement?.addEventListener('mouseenter', handleHeaderMouseEnter);
    headerElement?.addEventListener('mouseleave', handleHeaderMouseLeave);

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }

      clearHideTimer();
      window.removeEventListener('scroll', updateOnScroll);
      document.removeEventListener('scroll', updateOnScroll, true);
      window.removeEventListener('resize', updateOnScroll);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', resetTouchStart);
      window.removeEventListener('touchcancel', resetTouchStart);
      headerElement?.removeEventListener('mouseenter', handleHeaderMouseEnter);
      headerElement?.removeEventListener('mouseleave', handleHeaderMouseLeave);
      document.body.classList.remove(LANDING_MODE_CLASS, LANDING_VISIBLE_CLASS);
    };
  }, [pathname]);

  return null;
}
