import { useEffect } from 'react';
import printStyles from '../print.css?inline';

/** Fit the complete schedule on one landscape A4 sheet without clipping names. */
export function usePrintLayout() {
  useEffect(() => {
    const media = window.matchMedia('print');
    const stylesheet = document.createElement('style');
    stylesheet.media = 'print';
    stylesheet.textContent = printStyles;
    document.head.append(stylesheet);
    function fit() {
      const content = document.querySelector<HTMLElement>('.planner-content');
      if (!content) return;
      // beforeprint can fire before the browser switches its media query state.
      stylesheet.media = 'all';
      content.style.setProperty('--print-scale', '1');
      const availableHeight = 194 * 96 / 25.4; // A4 minus margins and rounding allowance.
      const height = Math.max(content.scrollHeight, content.getBoundingClientRect().height);
      content.style.setProperty('--print-scale', String(Math.min(1, availableHeight / Math.max(1, height))));
      stylesheet.media = 'print';
    }
    function reset() { document.querySelector<HTMLElement>('.planner-content')?.style.removeProperty('--print-scale'); }
    function changed() { if (media.matches) fit(); else reset(); }
    window.addEventListener('beforeprint', fit);
    window.addEventListener('afterprint', reset);
    media.addEventListener('change', changed);
    return () => {
      window.removeEventListener('beforeprint', fit);
      window.removeEventListener('afterprint', reset);
      media.removeEventListener('change', changed);
      stylesheet.remove();
      reset();
    };
  }, []);
}
