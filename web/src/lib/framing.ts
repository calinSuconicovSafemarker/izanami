/** Ticket 23: GitHub Pages can't forbid framing with headers, so the app checks itself. */

/** True when another page has put IZANAMI in a frame. */
export function isFramed(win: Window = window): boolean {
  try {
    return win.top !== win.self;
  } catch {
    // Reading a cross-origin `top` can throw; that only happens inside a frame.
    return true;
  }
}
