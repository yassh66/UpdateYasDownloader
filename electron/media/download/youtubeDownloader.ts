/**
 * Backwards compatibility shim for YouTubeDownloader.
 * Re-exports UniversalMediaDownloader and its types to ensure zero breaking changes across existing modules.
 */
import {
  universalMediaDownloader,
  UniversalMediaDownloader,
  UniversalDownloadOptions,
  MediaDownloadProgressEvent,
  MediaDownloadStage,
} from './universalMediaDownloader';

export type StartMediaDownloadOptions = UniversalDownloadOptions;
export type { MediaDownloadProgressEvent, MediaDownloadStage, UniversalDownloadOptions };

export const YouTubeDownloader = UniversalMediaDownloader;
export type YouTubeDownloader = UniversalMediaDownloader;

export const youtubeDownloader = universalMediaDownloader;
