import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { ActionSheetIOS, Alert, Platform } from "react-native";
import * as Crypto from "expo-crypto";
import type { FileUIPart } from "ai";

// Real image attachments for the composer. The prototype's paperclip only ever
// injected canned demo tiles; this is the honest path: the OS photo picker →
// base64 → a `data:` URL carried as an AI SDK `file` part. Because it is already
// a data URL (not a private-blob URL), the mobile BFF passes the bytes straight
// through `convertToModelMessages` to the vision model — no blob store, no
// session-gated read-back, and nothing ever lands on a public URL. Inlining at the
// source keeps the bytes off storage entirely.

// Attachment input types, kept in lockstep with web-v3's upload route
// (`ACCEPTED_IMAGE_TYPES` + `PDF_TYPE`). Images are read by the vision model
// directly; PDFs are extracted to text SERVER-SIDE in the BFF (unpdf) — a raw
// application/pdf part 500s the Gateway on the open models, so the client only
// ships the bytes and the server never forwards them verbatim.
const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const PDF_TYPE = "application/pdf";

// Per-file caps on the DECODED bytes, matching web-v3 (5MB image / 10MB PDF).
// Enforced after the picker returns so a huge file can't bloat the request / DB
// row. The base64 payload is ~4/3 of this; the server applies its own total cap.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
// A message can carry a few files, not a whole roll — bounds request size and
// the base64 held in memory.
const MAX_ATTACHMENTS = 4;

// A picked-but-not-yet-sent attachment (image or PDF). `url` is a complete
// `data:<mime>;base64,...` URL, so for an image it doubles as the thumbnail source,
// and for either it is the wire value of the file part.
export type PendingAttachment = {
  id: string;
  name: string;
  mediaType: string;
  url: string;
  /** decoded byte size — used only for the client-side cap + a size label. */
  bytes: number;
};

// base64 → decoded byte count without allocating the buffer (length * 3/4, minus
// any '=' padding). Good enough for a size guard.
function base64Bytes(b64: string): number {
  const len = b64.length;
  if (len === 0) return 0;
  let padding = 0;
  if (b64.endsWith("==")) padding = 2;
  else if (b64.endsWith("=")) padding = 1;
  return Math.floor((len * 3) / 4) - padding;
}

/**
 * Launch the OS photo picker and return the chosen images as pending attachments.
 * `remaining` caps how many can still be added to the current message. Returns []
 * on cancel / permission denied (an alert explains the latter). Oversize or
 * unsupported picks are skipped with an alert rather than silently dropped.
 */
export async function pickImages(
  remaining: number
): Promise<PendingAttachment[]> {
  if (remaining <= 0) return [];

  // Media-library permission. Modern Android uses the system photo picker (no
  // grant needed) but iOS + older Android still prompt — request explicitly so a
  // denial is a clear message, not a silent empty result.
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      "Photos permission needed",
      "Allow photo access in Settings to attach an image."
    );
    return [];
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    // Re-encode + moderate quality so a 12MP photo doesn't blow the byte cap.
    quality: 0.7,
    base64: true,
  });
  if (result.canceled) return [];

  const out: PendingAttachment[] = [];
  let skippedType = false;
  let skippedSize = false;

  for (const asset of result.assets) {
    const mediaType = normalizeMime(asset.mimeType, asset.fileName);
    if (!ACCEPTED_IMAGE_TYPES.has(mediaType)) {
      skippedType = true;
      continue;
    }
    if (!asset.base64) {
      // `base64: true` was requested, so this is unexpected — skip rather than
      // send an empty file part.
      skippedType = true;
      continue;
    }
    const bytes = asset.fileSize ?? base64Bytes(asset.base64);
    if (bytes > MAX_IMAGE_BYTES) {
      skippedSize = true;
      continue;
    }
    out.push({
      id: Crypto.randomUUID(),
      name: asset.fileName || `image.${extFor(mediaType)}`,
      mediaType,
      url: `data:${mediaType};base64,${asset.base64}`,
      bytes,
    });
    if (out.length >= remaining) break;
  }

  if (skippedSize) {
    Alert.alert("Image too large", "Images must be 5 MB or smaller.");
  } else if (skippedType) {
    Alert.alert("Unsupported image", "Attach a JPEG, PNG, WebP, or GIF.");
  }
  return out;
}

/**
 * Launch the OS file picker (Files / storage) for PDFs and images, returning the
 * chosen files as pending attachments. Bytes are read off the picked URI via
 * expo-file-system (`File.base64()`) — DocumentPicker only returns base64 on web.
 * Images are inlined for the vision model; PDFs ride as `application/pdf` data URLs
 * that the BFF extracts to text server-side. Oversize / unsupported / unreadable
 * picks are skipped with an alert. Returns [] on cancel.
 */
export async function pickFiles(
  remaining: number
): Promise<PendingAttachment[]> {
  if (remaining <= 0) return [];

  const result = await DocumentPicker.getDocumentAsync({
    type: [PDF_TYPE, "image/*"],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];

  const out: PendingAttachment[] = [];
  let skippedType = false;
  let skippedSize = false;
  let failed = false;

  for (const asset of result.assets) {
    if (out.length >= remaining) break;
    const mediaType = normalizeFileMime(asset.mimeType, asset.name);
    const isPdf = mediaType === PDF_TYPE;
    const isImage = ACCEPTED_IMAGE_TYPES.has(mediaType);
    if (!isPdf && !isImage) {
      skippedType = true;
      continue;
    }
    let b64: string;
    try {
      // Copied into the cache dir (copyToCacheDirectory), so this is a readable
      // file:// URI — read the raw bytes as base64 for the data URL.
      b64 = await new File(asset.uri).base64();
    } catch {
      failed = true;
      continue;
    }
    const bytes = asset.size ?? base64Bytes(b64);
    if (bytes > (isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES)) {
      skippedSize = true;
      continue;
    }
    out.push({
      id: Crypto.randomUUID(),
      name:
        asset.name || (isPdf ? "document.pdf" : `image.${extFor(mediaType)}`),
      mediaType,
      url: `data:${mediaType};base64,${b64}`,
      bytes,
    });
  }

  if (failed) {
    Alert.alert("Something went wrong");
  } else if (skippedSize) {
    Alert.alert("File too large", "PDFs must be 10 MB or smaller, images 5 MB.");
  } else if (skippedType) {
    Alert.alert(
      "Unsupported file",
      "Attach a PDF or an image (JPEG, PNG, WebP, GIF)."
    );
  }
  return out;
}

/**
 * Paperclip entry point: offer "Photo Library" (photos, via the image picker with
 * re-encode/compression) or "Files" (PDFs + images from storage, via the document
 * picker). A native action sheet on iOS; an Alert-backed chooser on Android (RN has
 * no cross-platform sheet primitive). Resolves to the staged attachments, or [] if
 * the user backs out at any step. `remaining` caps how many can still be added.
 */
export function pickAttachment(
  remaining: number
): Promise<PendingAttachment[]> {
  if (remaining <= 0) return Promise.resolve([]);
  return new Promise((resolve) => {
    const run = (source: "photos" | "files") =>
      (source === "photos" ? pickImages(remaining) : pickFiles(remaining)).then(
        resolve,
        // A picker throw is surfaced by the picker itself (alerts above); resolve
        // empty so the caller never hangs on a rejected chooser.
        () => resolve([])
      );
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: "Attach",
          options: ["Cancel", "Photo Library", "Files"],
          cancelButtonIndex: 0,
        },
        (i) => {
          if (i === 1) run("photos");
          else if (i === 2) run("files");
          else resolve([]);
        }
      );
    } else {
      Alert.alert(
        "Attach",
        undefined,
        [
          { text: "Photo Library", onPress: () => run("photos") },
          { text: "Files", onPress: () => run("files") },
          { text: "Cancel", style: "cancel", onPress: () => resolve([]) },
        ],
        { cancelable: true, onDismiss: () => resolve([]) }
      );
    }
  });
}

// Turn pending attachments into AI SDK `file` parts (the shape `sendMessage({
// files })` and the wire expect). `filename` rides along so the model + the
// thread can label the image or PDF.
export function toFileParts(atts: PendingAttachment[]): FileUIPart[] {
  return atts.map((a) => ({
    type: "file" as const,
    mediaType: a.mediaType,
    filename: a.name,
    url: a.url,
  }));
}

export { MAX_ATTACHMENTS };

// The picker sometimes returns no/odd mimeType; fall back to the filename ext,
// then to jpeg. Lowercased so the Set lookup is stable.
function normalizeMime(
  mime: string | undefined | null,
  name: string | undefined | null
): string {
  if (mime && mime.includes("/")) return mime.toLowerCase();
  const ext = (name?.split(".").pop() ?? "").toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

function extFor(mediaType: string): string {
  if (mediaType === "image/png") return "png";
  if (mediaType === "image/webp") return "webp";
  if (mediaType === "image/gif") return "gif";
  return "jpg";
}

// DocumentPicker usually reports a real mimeType; fall back to the filename ext for
// the types we accept, else return the raw mime (or octet-stream) so an unknown file
// is REJECTED, not silently coerced to an image the way `normalizeMime` would.
function normalizeFileMime(
  mime: string | undefined | null,
  name: string | undefined | null
): string {
  if (mime && mime.includes("/")) return mime.toLowerCase();
  const ext = (name?.split(".").pop() ?? "").toLowerCase();
  if (ext === "pdf") return PDF_TYPE;
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return mime?.toLowerCase() || "application/octet-stream";
}
