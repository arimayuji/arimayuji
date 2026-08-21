/**
 * Profile photo upload — the one piece of "identity" this app can't get
 * from Google/Apple sign-in (neither OAuth response this app reads back
 * carries a usable avatar URL). Stored in the `avatars` Storage bucket
 * (scripts/appwrite-setup.ts), one file per account under a deterministic
 * ID (the account's own ID, same "row ID = owner's account ID" convention
 * `createProfile` already uses) — a re-upload replaces the previous file
 * outright instead of leaving old ones orphaned in the bucket.
 */
import { Permission, Role } from "appwrite";
import { AVATARS_BUCKET_ID, getAppwrite } from "./appwrite";
import { updateProfile } from "./auth";

/** Uploads `file` as the signed-in account's avatar, writes the resulting URL onto its profile row, and returns that URL. `null` if Appwrite isn't configured. */
export async function uploadAvatar(file: File): Promise<string | null> {
  const appwrite = getAppwrite();
  if (!appwrite) return null;
  const account = await appwrite.account.get();
  const userId = account.$id;
  const fileId = userId;

  try {
    await appwrite.storage.deleteFile({ bucketId: AVATARS_BUCKET_ID, fileId });
  } catch {
    // No previous avatar to replace — fine, this is the first upload.
  }

  await appwrite.storage.createFile({
    bucketId: AVATARS_BUCKET_ID,
    fileId,
    file,
    permissions: [Permission.update(Role.user(userId)), Permission.delete(Role.user(userId))],
  });

  const url = appwrite.storage.getFileView({ bucketId: AVATARS_BUCKET_ID, fileId });
  await updateProfile(userId, { avatarUrl: url });
  return url;
}
