import "server-only";
import { drive as driveClient, auth as googleAuth } from "@googleapis/drive";
import { Readable } from "stream";

/**
 * Upload proof photos to Google Drive via a service account.
 * Uses the lightweight per-API package (@googleapis/drive) instead of the
 * heavy `googleapis` meta-package, which can OOM the Next.js build.
 * Env:
 *   GOOGLE_SERVICE_ACCOUNT_JSON — base64-encoded service-account JSON
 *   GOOGLE_DRIVE_FOLDER_ID      — target Drive folder id
 */
export function isGoogleDriveConfigured(): boolean {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON && !!process.env.GOOGLE_DRIVE_FOLDER_ID;
}

function getDrive() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!raw || !folderId) {
    throw new Error(
      "Google Drive is not configured (GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_DRIVE_FOLDER_ID missing).",
    );
  }
  const credentials = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  const authObj = new googleAuth.GoogleAuth({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return { drive: driveClient({ version: "v3", auth: authObj }), folderId: folderId.trim() };
}

/** Upload a base64 JPEG, make it link-viewable, return the shareable link. */
export async function uploadToGoogleDrive(
  base64Data: string,
  fileName: string,
): Promise<{ fileId: string; webViewLink: string }> {
  const { drive, folderId } = getDrive();
  const cleaned = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(cleaned, "base64");
  const stream = Readable.from(buffer);

  const response = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType: "image/jpeg", body: stream },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });

  const fileId = response.data.id;
  if (!fileId) throw new Error("Google Drive upload returned no file id");

  // Anyone with the link can view (so the academy can open the proof).
  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
    supportsAllDrives: true,
  });

  return {
    fileId,
    webViewLink: response.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
  };
}
