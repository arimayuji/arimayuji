/**
 * Content-planning board behind `/interno/conteudo` — an idea's pillar,
 * status, and a link to wherever the actual asset lives (an Artifact,
 * Recraft Studio, a finished video). This module never generates or hosts
 * anything itself; see SOCIAL-CONTEXT.md for why that stays external.
 *
 * Unlike every other table in this app, `content_ideas` grants CRUD
 * directly to a fixed set of accounts at the table level (see
 * scripts/appwrite-setup.ts) — so these are plain client SDK calls, no
 * privileged Appwrite Function needed. `src/lib/internalTeam.ts`'s
 * allowlist gates the *page*; Appwrite's own permissions are what actually
 * stop anyone else from calling these functions directly.
 *
 * Same degrade-to-empty/false convention as the rest of the backend layer.
 */
import { ID, Query, type Models } from "appwrite";
import { APPWRITE_DATABASE_ID, TABLES, getAppwrite } from "./appwrite";
import { getCurrentAccount } from "./auth";

export type ContentPillar = "produto" | "autentico" | "autoridade" | "marca" | "comunidade";
export type ContentStatus = "ideia" | "rascunho" | "agendado" | "publicado";

export interface ContentIdea extends Models.Row {
  title: string;
  pillar: ContentPillar;
  status: ContentStatus;
  notes?: string;
  assetUrl?: string;
  createdBy: string;
}

export interface NewContentIdea {
  title: string;
  pillar: ContentPillar;
  notes?: string;
  assetUrl?: string;
}

/** Newest first — the board re-sorts by status client-side, this just gives it a stable starting order. */
export async function listContentIdeas(): Promise<ContentIdea[]> {
  const appwrite = getAppwrite();
  if (!appwrite) return [];
  try {
    const result = await appwrite.tablesDB.listRows<ContentIdea>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.contentIdeas,
      queries: [Query.orderDesc("$createdAt"), Query.limit(200)],
    });
    return result.rows;
  } catch {
    return [];
  }
}

/**
 * `createdBy` always comes from the live session, never a parameter — same
 * rule `shareRunWithCoaches`/`sendFriendRequest` follow, so one account can
 * never mint a row attributed to someone else. Always starts at `"ideia"`;
 * Appwrite rejects a default value on a required column, so the app must
 * pass it explicitly, same as `runs.visibility`/`friendships.status`.
 */
export async function createContentIdea(input: NewContentIdea): Promise<ContentIdea | null> {
  const appwrite = getAppwrite();
  if (!appwrite) return null;
  const account = await getCurrentAccount();
  if (!account) return null;
  try {
    return await appwrite.tablesDB.createRow<ContentIdea>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.contentIdeas,
      rowId: ID.unique(),
      data: {
        title: input.title,
        pillar: input.pillar,
        status: "ideia",
        notes: input.notes || undefined,
        assetUrl: input.assetUrl || undefined,
        createdBy: account.id,
      },
    });
  } catch {
    return null;
  }
}

export async function updateContentIdeaStatus(id: string, status: ContentStatus): Promise<boolean> {
  const appwrite = getAppwrite();
  if (!appwrite) return false;
  try {
    await appwrite.tablesDB.updateRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.contentIdeas,
      rowId: id,
      data: { status },
    });
    return true;
  } catch {
    return false;
  }
}

export async function deleteContentIdea(id: string): Promise<boolean> {
  const appwrite = getAppwrite();
  if (!appwrite) return false;
  try {
    await appwrite.tablesDB.deleteRow({ databaseId: APPWRITE_DATABASE_ID, tableId: TABLES.contentIdeas, rowId: id });
    return true;
  } catch {
    return false;
  }
}
