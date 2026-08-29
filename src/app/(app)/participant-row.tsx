import type { GroupRunParticipantConnection } from "@/lib/groupRuns";
import { Avatar } from "./avatar";

/** One roster row (avatar + name + @handle) — shared by `/longao` and the QR-pairing lobby, extracted so neither duplicates this markup. */
export function ParticipantRow({ connection }: { connection: GroupRunParticipantConnection }) {
  const { profile } = connection;
  return (
    <li className="flex items-center gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <Avatar name={profile?.displayName ?? "?"} avatarUrl={profile?.avatarUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{profile?.displayName ?? "Corredor(a)"}</p>
        <p className="truncate font-mono text-xs text-muted">
          {profile ? `@${profile.handle}` : "conta sem @ ainda"}
        </p>
      </div>
    </li>
  );
}
