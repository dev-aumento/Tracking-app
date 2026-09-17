import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const TRANSCODE_TIMEOUT_MS = 180_000;

const TRANSCODE_EXT = new Set([
  "mov",
  "m4v",
  "avi",
  "mkv",
  "wmv",
  "flv",
  "mts",
  "m2ts",
  "3gp",
  "qt",
]);

const TRANSCODE_MIME = new Set([
  "video/quicktime",
  "video/x-quicktime",
  "video/x-m4v",
  "video/x-msvideo",
  "video/x-matroska",
  "video/x-ms-wmv",
]);

function fileExt(fileName: string) {
  const parts = fileName.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

export function isVideoAttachment(fileName: string, mimeType: string) {
  if (mimeType.startsWith("video/")) return true;
  return /^(mp4|mov|webm|m4v|avi|mkv|wmv|3gp)$/i.test(fileExt(fileName));
}

export function needsVideoTranscode(fileName: string, mimeType: string) {
  const ext = fileExt(fileName);
  return TRANSCODE_EXT.has(ext) || TRANSCODE_MIME.has(mimeType);
}

function resolveFfmpegPath() {
  if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }

  const bundled = [
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg.exe"),
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
  ].find((candidate) => existsSync(candidate));

  return bundled || "ffmpeg";
}

async function runFfmpeg(args: string[]) {
  const bin = resolveFfmpegPath();
  await execFileAsync(bin, args, {
    windowsHide: true,
    timeout: TRANSCODE_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
  });
}

export type BrowserVideoPreview = {
  data: Buffer;
  mimeType: string;
  posterJpeg: Buffer | null;
  transcoded: boolean;
};

export async function prepareBrowserVideo(
  input: Buffer,
  fileName: string,
  mimeType: string,
): Promise<BrowserVideoPreview | null> {
  if (!isVideoAttachment(fileName, mimeType)) return null;

  const dir = await mkdtemp(path.join(tmpdir(), "crm-vid-"));
  const ext = fileExt(fileName) || "bin";
  const sourcePath = path.join(dir, `input.${ext}`);
  const mp4Path = path.join(dir, "output.mp4");
  const posterPath = path.join(dir, "poster.jpg");

  try {
    await writeFile(sourcePath, input);
    const shouldTranscode = needsVideoTranscode(fileName, mimeType);
    let playablePath = sourcePath;
    let playableMime = mimeType.startsWith("video/") ? mimeType : "video/mp4";
    let transcoded = false;

    if (shouldTranscode) {
      await runFfmpeg([
        "-y",
        "-i",
        sourcePath,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-vf",
        "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-c:a",
        "aac",
        "-ac",
        "2",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        mp4Path,
      ]);
      playablePath = mp4Path;
      playableMime = "video/mp4";
      transcoded = true;
    }

    let posterJpeg: Buffer | null = null;
    try {
      await runFfmpeg([
        "-y",
        "-ss",
        "0.4",
        "-i",
        playablePath,
        "-frames:v",
        "1",
        "-vf",
        "scale=480:-2",
        "-q:v",
        "4",
        posterPath,
      ]);
      posterJpeg = await readFile(posterPath);
    } catch {
      try {
        await runFfmpeg([
          "-y",
          "-i",
          playablePath,
          "-frames:v",
          "1",
          "-vf",
          "scale=480:-2",
          "-q:v",
          "4",
          posterPath,
        ]);
        posterJpeg = await readFile(posterPath);
      } catch {
        posterJpeg = null;
      }
    }

    const data = transcoded ? await readFile(mp4Path) : input;
    return {
      data,
      mimeType: transcoded ? "video/mp4" : playableMime,
      posterJpeg,
      transcoded,
    };
  } catch (error) {
    console.error("[video-preview] Failed to prepare browser video:", error);
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
