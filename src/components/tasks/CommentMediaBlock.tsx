import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, Play, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import {
  base64ToBlob,
  downloadFileFromBase64,
  getBrowserPlayableMimeType,
  getTaskFileBadge,
  isImageMimeType,
  isVideoMimeType,
  openFileFromBase64,
} from "@/lib/task-files";
import type { CommentMediaRef } from "@/lib/rich-comment";
import { cn } from "@/lib/utils";

const TILE = "h-[150px] w-[150px] shrink-0";

type CommentMediaBlockProps = {
  media: CommentMediaRef;
  /** @deprecated Prefer `variant`. */
  compact?: boolean;
  /** All variants render as a 150×150 grid tile. */
  variant?: "thumb" | "file" | "auto";
  className?: string;
};

function useObjectUrl(dataBase64: string | undefined, mimeType: string) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!dataBase64) {
      setUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(base64ToBlob(dataBase64, mimeType));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [dataBase64, mimeType]);

  return url;
}

function MediaLightbox({
  open,
  title,
  onClose,
  onDownload,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onDownload: () => void;
  children: ReactNode;
}) {
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex w-[min(94vw,1080px)] flex-col rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#151c2c]"
        style={{ transform: "none" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 rounded-t-xl border-b border-gray-100 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#151c2c]">
          <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{title}</p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onDownload}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 text-xs font-medium text-white hover:bg-[#1D4ED8]"
            >
              <Download size={14} />
              Download
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
              aria-label="Close preview"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="h-[min(68vh,640px)] min-h-[min(62vh,520px)] w-full rounded-b-xl bg-black">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function CommentMediaBlock({
  media,
  className,
}: CommentMediaBlockProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const { data, isLoading, isError } = trpc.task.getAttachment.useQuery(
    { id: media.id },
    { enabled: media.id > 0 },
  );

  const isImage = isImageMimeType(media.mimeType, media.fileName);
  const isVideo = isVideoMimeType(media.mimeType, media.fileName);
  const badge = getTaskFileBadge(media.fileName, media.mimeType);
  const showAsFile = !isImage && !isVideo;

  const originalMime = media.mimeType || data?.mimeType || "application/octet-stream";
  const blobMime = isVideo
    ? (data?.mimeType || getBrowserPlayableMimeType(originalMime, media.fileName))
    : originalMime;
  const playbackUrl = useObjectUrl(data?.dataBase64, blobMime);
  const posterUrl = data?.posterBase64
    ? `data:image/jpeg;base64,${data.posterBase64}`
    : "";

  const openInNewTab = () => {
    if (!data?.dataBase64) return;
    openFileFromBase64(media.fileName, blobMime, data.dataBase64);
  };

  const downloadMedia = () => {
    if (!data?.dataBase64) return;
    const downloadName = isVideo && blobMime === "video/mp4" && !/\.mp4$/i.test(media.fileName)
      ? media.fileName.replace(/\.[^.]+$/, "") + ".mp4"
      : media.fileName;
    downloadFileFromBase64(downloadName, blobMime, data.dataBase64);
  };

  if (isLoading) {
    return (
      <div
        className={cn(
          TILE,
          "inline-flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50",
          className,
        )}
      >
        <Loader2 size={16} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (isError || !data?.dataBase64) {
    return (
      <div
        className={cn(
          TILE,
          "inline-flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 px-2 text-center text-[11px] text-gray-500 break-all",
          className,
        )}
      >
        {media.fileName} (unavailable)
      </div>
    );
  }

  if (showAsFile) {
    return (
      <div
        className={cn(
          TILE,
          "relative inline-flex flex-col items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm",
          className,
        )}
        title={media.fileName}
      >
        <span
          className={cn(
            "inline-flex h-12 w-12 items-center justify-center rounded-lg text-[11px] font-bold",
            badge.badgeClass,
          )}
        >
          {badge.label}
        </span>
        <p className="line-clamp-2 w-full text-center text-[11px] font-semibold text-gray-800 break-all">
          {media.fileName}
        </p>
        <button
          type="button"
          onClick={downloadMedia}
          className="absolute bottom-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#2563EB] text-white hover:bg-[#1D4ED8]"
          aria-label={`Download ${media.fileName}`}
          title="Download"
        >
          <Download size={14} />
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setPreviewOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setPreviewOpen(true);
          }
        }}
        className={cn(
          TILE,
          "group relative inline-flex cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-gray-200 shadow-sm hover:ring-2 hover:ring-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40",
          isVideo ? "bg-gray-900" : "bg-gray-50",
          className,
        )}
        title={media.fileName}
        aria-label={`Preview ${media.fileName}`}
      >
        {isImage ? (
          <img
            src={playbackUrl}
            alt={media.fileName}
            className="pointer-events-none h-full w-full object-cover"
          />
        ) : (
          <>
            {posterUrl ? (
              <img
                src={posterUrl}
                alt=""
                className="pointer-events-none h-full w-full object-cover"
              />
            ) : playbackUrl ? (
              <video
                src={playbackUrl}
                muted
                playsInline
                preload="metadata"
                className="pointer-events-none h-full w-full object-cover"
              />
            ) : null}
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 dark:bg-black/50">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm">
                <Play
                  size={14}
                  className="ml-0.5 fill-[#111827] dark:fill-white stroke-[#111827] dark:stroke-white text-[#111827] dark:text-white"
                  color="#111827"
                />
              </span>
            </span>
          </>
        )}
      </div>

      <MediaLightbox
        open={previewOpen}
        title={media.fileName}
        onClose={() => setPreviewOpen(false)}
        onDownload={downloadMedia}
      >
        {isImage ? (
          <img
            src={playbackUrl}
            alt={media.fileName}
            title="Open in new tab"
            onClick={openInNewTab}
            className="h-full w-full cursor-zoom-in object-contain"
          />
        ) : playbackUrl ? (
          <video
            src={playbackUrl}
            poster={posterUrl || undefined}
            controls
            autoPlay
            playsInline
            preload="auto"
            title="Open in new tab"
            className="h-full w-full cursor-zoom-in object-contain"
            style={{ transform: "none" }}
            onClick={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              if (event.clientY > bounds.bottom - 48) return;
              openInNewTab();
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Loader2 size={22} className="animate-spin text-gray-400" />
          </div>
        )}
      </MediaLightbox>
    </>
  );
}
