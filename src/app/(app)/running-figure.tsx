/**
 * A small running-in-place figure for wait states — GPS lock today, maybe
 * more later. Same rigid-limb-pivoting technique as the shoe's tumble: no
 * animation library, no skeleton/IK, just a handful of CSS keyframes (see
 * `pr-run-leg`/`pr-run-arm`/`pr-run-bob` in globals.css) rotating a stroke
 * from its joint. `variant` only changes the ponytail — the run cycle itself
 * is identical, on purpose: two people waiting for the same signal.
 */
export function RunningFigure({
  variant,
  className = "h-16 w-auto",
}: {
  variant: "woman" | "man";
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 60 90"
      className={`${className} pr-run-bob`}
      fill="none"
      stroke="currentColor"
      strokeWidth="4.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Far arm and leg: same rig, drawn first (behind) and dimmed, for depth. */}
      <g opacity="0.45">
        <path
          className="pr-run-leg-b"
          style={{ transformOrigin: "25px 44px", transform: "rotate(28deg)" }}
          d="M 25 44 C 21.5 52, 19 61, 17.5 70 C 17 74, 14.5 77, 10 77.5"
        />
        <path
          className="pr-run-arm-a"
          style={{ transformOrigin: "33px 21px", transform: "rotate(-24deg)" }}
          d="M 33 21 C 35.5 26.5, 37 32, 35.5 37.5"
        />
      </g>

      {/* Torso: static, the pivots for both limb pairs live off its ends. */}
      <path d="M 34 20 C 30.5 27.5, 26.5 35.5, 25 44" />
      <circle cx="32" cy="13.5" r="6.2" />
      {variant === "woman" && (
        <path
          d="M 27 9.5 C 21.5 8, 18.5 12.5, 20.5 18.5 C 21.5 21.5, 24.5 20.5, 25.5 17"
          strokeWidth="3.2"
        />
      )}

      {/* Near arm and leg, on top and full strength. */}
      <path
        className="pr-run-leg-a"
        style={{ transformOrigin: "25px 44px", transform: "rotate(-30deg)" }}
        d="M 25 44 C 22 53, 19.5 62, 17.5 71.5 C 16.7 75.5, 13.5 78.5, 8 79"
      />
      <path
        className="pr-run-arm-b"
        style={{ transformOrigin: "33px 21px", transform: "rotate(27deg)" }}
        d="M 33 21 C 36 26.5, 38 32, 36.5 38"
      />
    </svg>
  );
}
