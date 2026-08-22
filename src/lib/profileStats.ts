/**
 * Cumulative distance/run-count per account — the numbers shown on a
 * friend's profile (`/perfil/ver`). Same one-row-per-owner shape as
 * `profiles` (row ID is the account's own user ID), and the same
 * read-then-write "not atomic" tradeoff `recordRunAtPlace`
 * (placeLeaderboard.ts) already documents.
 *
 * Unlike the place leaderboard, there's no opt-in gate here — recorded
 * unconditionally for anyone signed in who finishes a run. A friend
 * already sees your real name and handle everywhere else in the app, so a
 * running total isn't a new category of exposure the public place
 * leaderboard is (see the permissions comment in scripts/appwrite-setup.ts
 * for the row-level detail): the row is public-read at the Appwrite level,
 * but the profile page only ever surfaces it to a confirmed friend.
 */
import { Permission, Role, type Models } from "appwrite";
import { APPWRITE_DATABASE_ID, TABLES, getAppwrite } from "./appwrite";

export interface ProfileStats extends Models.Row {
  userId: string;
  totalMeters: number;
  totalRuns: number;
}

/**
 * Adds one finished run's distance to this account's running total,
 * creating the row on the first one. `userId` is read from the live
 * session, never a parameter — same reasoning `recordRunAtPlace`
 * (placeLeaderboard.ts) documents: trusting a caller-supplied id would
 * let this public row be seeded/attributed to the wrong account (an
 * IDOR fixed in an LGPD/security audit pass — this used to take
 * `userId` as its first argument).
 */
export async function recordFinishedRun(distanceMeters: number): Promise<void> {
  const appwrite = getAppwrite();
  if (!appwrite) return;
  const account = await appwrite.account.get();
  const userId = account.$id;

  let current: ProfileStats | null = null;
  try {
    current = await appwrite.tablesDB.getRow<ProfileStats>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.profileStats,
      rowId: userId,
    });
  } catch {
    current = null;
  }

  const data = {
    userId,
    totalMeters: (current?.totalMeters ?? 0) + distanceMeters,
    totalRuns: (current?.totalRuns ?? 0) + 1,
  };

  if (current) {
    await appwrite.tablesDB.updateRow<ProfileStats>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.profileStats,
      rowId: userId,
      data,
    });
  } else {
    await appwrite.tablesDB.createRow<ProfileStats>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.profileStats,
      rowId: userId,
      data,
      permissions: [
        Permission.read(Role.any()),
        Permission.update(Role.user(userId)),
        Permission.delete(Role.user(userId)),
      ],
    });
  }
}

export async function getProfileStats(userId: string): Promise<ProfileStats | null> {
  const appwrite = getAppwrite();
  if (!appwrite) return null;
  try {
    return await appwrite.tablesDB.getRow<ProfileStats>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.profileStats,
      rowId: userId,
    });
  } catch {
    return null;
  }
}
