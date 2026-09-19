/**
 * The front page's example carousel: which made-up group is on screen, and
 * when it moves on.
 *
 * It exists to answer "what is this for?" for someone who has just arrived and
 * has no groups of their own. A single frozen example says far less than
 * watching a basketball squad, a book club and a family each come up with
 * their own crowded calendar.
 *
 * It stops for good the first time the person touches anything. Content that
 * keeps moving while you are reading it is not a demo any more, it is an
 * interruption: you go to look at a date the search found and it swaps out
 * from under you. Stopping is deliberately permanent rather than a pause,
 * because once someone is using the page they are no longer watching a demo.
 *
 * It also never runs for someone whose system asks for reduced motion.
 * Content that advances on its own is exactly what that setting is about.
 */
import { useCallback, useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

/** How long each example group stays on screen. */
export const CAROUSEL_INTERVAL_MS = 5000;

export interface Carousel {
  /** Which example is showing. */
  index: number;
  /** True while it is still advancing on its own. */
  running: boolean;
  /** Stop it, for good. Safe to call any number of times. */
  stop: () => void;
}

export function useExampleCarousel(count: number, enabled: boolean): Carousel {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [stopped, setStopped] = useState(false);

  const running = enabled && !stopped && !reduceMotion && count > 1;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, CAROUSEL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [running, count]);

  const stop = useCallback(() => setStopped(true), []);

  return { index, running, stop };
}
