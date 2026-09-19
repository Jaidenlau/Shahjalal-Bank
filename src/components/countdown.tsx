"use client";

import { useEffect, useState } from "react";
import { countdown } from "@/lib/date";

/**
 * A live countdown that cannot break hydration.
 *
 * `countdown()` reads the clock, so a server component embedding its result
 * directly puts a value into the HTML that is already stale by the time the
 * browser hydrates. React compares the two and throws a hydration error — one
 * that appears only when the render happens to straddle a minute boundary,
 * which is exactly the kind of fault that stays hidden until it surfaces in
 * front of a room.
 *
 * So the server passes the string it rendered, this component's first render
 * returns that same string, and only after mount does it start computing from
 * the browser's own clock and ticking. The server HTML and the first client
 * render are identical by construction.
 */
export function Countdown({ to, initial, className = "" }: {
  /** The instant counted down to. Dates cross the server boundary intact. */
  to: Date | string | null | undefined;
  /** What the server already rendered. The first client render must match it. */
  initial: string;
  className?: string;
}) {
  const [text, setText] = useState(initial);

  const iso = to ? new Date(to).toISOString() : "";

  useEffect(() => {
    if (!iso) return;
    const tick = () => setText(countdown(new Date(iso)));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [iso]);

  return <span className={className} suppressHydrationWarning>{text}</span>;
}
