import { WORDMARK_HEIGHT } from "../lib/layout";

/**
 * Brand title: lowercase "touchgrass" in Dotscript Cursive, centered at the top
 * of the popup (below the panel's drag handle). Fixed height so the popup grows
 * by exactly WORDMARK_HEIGHT + its gap instead of squeezing the content below.
 */
export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <h1
      data-testid="puddle-title"
      className="m-0 flex shrink-0 items-center justify-center text-center leading-none"
      style={{ height: WORDMARK_HEIGHT, fontSize: size }}
    >
      touchgrass
    </h1>
  );
}
