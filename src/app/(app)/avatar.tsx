"use client";

/**
 * The one avatar component every person-facing list in the app renders
 * through — friends, coach/student, longão participants, the signed-in
 * account itself. Used to be four near-identical copies of the same
 * initials-circle, one per screen; consolidated here once `avatarUrl`
 * (src/lib/avatar.ts, `Profile.avatarUrl`) gave them something real to
 * fall back *from*. Renders the photo when there is one, the same
 * gradient initials circle as before when there isn't — nobody who never
 * uploads a photo sees any visual change.
 */

const SIZE_CLASSES = {
  sm: "h-9 w-9 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-13 w-13 text-base",
} as const;

export function Avatar({
  name,
  avatarUrl,
  size = "md",
  className = "",
}: {
  /** Used for the initials fallback only — never shown once `avatarUrl` is set. */
  name: string;
  avatarUrl?: string | null;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- an Appwrite Storage URL, not a local asset next/image's optimizer could do anything with.
      <img
        src={avatarUrl}
        alt=""
        className={`shrink-0 rounded-full object-cover ${SIZE_CLASSES[size]} ${className}`}
      />
    );
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent/40 font-bold text-accent-foreground ${SIZE_CLASSES[size]} ${className}`}
    >
      {/* `?? ""` não é paranoia de tipo: `name` costuma vir de uma coluna
          de `profiles` lida da rede, e uma linha sem essa coluna (schema
          mais novo que a linha, cliente antigo que gravou sem ela)
          derrubava a tela inteira com "Cannot read properties of
          undefined" — o app inteiro em branco por causa de uma inicial.
          Degradar pro "?" que o fallback já previa é o comportamento
          honesto. */}
      {(name ?? "").charAt(0).toUpperCase() || "?"}
    </span>
  );
}
