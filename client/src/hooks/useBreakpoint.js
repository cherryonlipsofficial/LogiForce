import { useState, useEffect } from 'react';

export const MOBILE = 768;
export const TABLET = 1024;

const getMatches = () => {
  if (typeof window === 'undefined') return { isMobile: false, isTablet: false, isDesktop: true };
  const width = window.innerWidth;
  return {
    isMobile: width <= MOBILE,
    isTablet: width > MOBILE && width <= TABLET,
    isDesktop: width > TABLET,
  };
};

export function useBreakpoint() {
  const [bp, setBp] = useState(getMatches);

  useEffect(() => {
    const mqlMobile = window.matchMedia(`(max-width: ${MOBILE}px)`);
    const mqlTablet = window.matchMedia(`(min-width: ${MOBILE + 1}px) and (max-width: ${TABLET}px)`);

    const update = () => setBp(getMatches());

    mqlMobile.addEventListener('change', update);
    mqlTablet.addEventListener('change', update);

    return () => {
      mqlMobile.removeEventListener('change', update);
      mqlTablet.removeEventListener('change', update);
    };
  }, []);

  return bp;
}
