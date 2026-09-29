import { MediaFormatOption, MediaInfo, StandardQuality, TargetContainer } from '../types';
export type { StandardQuality, TargetContainer };

export interface QualityProfile {
  quality: StandardQuality;
  height: number;
  label: string; // e.g., "4K Ultra HD (2160p)", "Full HD (1080p)"
  videoFormat?: MediaFormatOption;
  audioFormat?: MediaFormatOption;
  isDash: boolean; // Needs video + audio merge
  estimatedTotalSize?: number;
  container: TargetContainer;
}

export interface MediaQualitySelectionResult {
  title: string;
  cleanFileName: string;
  originalUrl: string;
  selectedQuality: StandardQuality;
  targetContainer: TargetContainer;
  videoTrack?: MediaFormatOption;
  audioTrack?: MediaFormatOption;
  isDashMergeRequired: boolean;
  isAudioOnly: boolean;
  estimatedSizeBytes?: number;
  availableProfiles: QualityProfile[];
}

export class FormatSelector {
  private readonly STANDARD_RESOLUTIONS: { quality: StandardQuality; height: number; width: number; label: string }[] = [
    { quality: '2160p', height: 2160, width: 3840, label: '4K Ultra HD (2160p)' },
    { quality: '1440p', height: 1440, width: 2560, label: '2K Quad HD (1440p)' },
    { quality: '1080p', height: 1080, width: 1920, label: 'Full HD (1080p)' },
    { quality: '720p', height: 720, width: 1280, label: 'HD (720p)' },
    { quality: '480p', height: 480, width: 854, label: 'SD (480p)' },
    { quality: '360p', height: 360, width: 640, label: 'Low (360p)' },
  ];

  /**
   * Finds the best available audio format from the format list.
   * Prefers stable, non-DRM, public audio tracks (e.g. 140 m4a or 251 opus).
   */
  public findBestAudioFormat(formats: MediaFormatOption[]): MediaFormatOption | undefined {
    const validAudio = formats.filter((f) => {
      if (!f.hasAudio) return false;
      if (f.hasDrm) return false;
      if (f.isPremium) return false;
      return true;
    });

    const audioTracks = validAudio.filter((f) => !f.hasVideo);
    const pool = audioTracks.length > 0 ? audioTracks : validAudio.length > 0 ? validAudio : formats.filter((f) => f.hasAudio);

    if (pool.length === 0) return undefined;

    return pool.sort((a, b) => {
      const isPremA = a.isPremium ? 1 : 0;
      const isPremB = b.isPremium ? 1 : 0;
      if (isPremA !== isPremB) return isPremA - isPremB; // Non-premium first

      // Prefer standard known audio formats (140, 251, 250)
      const isStandardA = ['140', '251', '250'].includes(a.formatId) ? 1 : 0;
      const isStandardB = ['140', '251', '250'].includes(b.formatId) ? 1 : 0;
      if (isStandardB !== isStandardA) return isStandardB - isStandardA;

      const extA = (a.ext || '').toLowerCase();
      const extB = (b.ext || '').toLowerCase();
      const isAacA = extA === 'm4a' || (a.acodec || '').includes('mp4a') ? 1 : 0;
      const isAacB = extB === 'm4a' || (b.acodec || '').includes('mp4a') ? 1 : 0;

      const bitA = a.abr || a.tbr || 0;
      const bitB = b.abr || b.tbr || 0;

      // If bitrates are close, prefer m4a for MP4 container compatibility
      if (Math.abs(bitA - bitB) <= 32 && isAacA !== isAacB) {
        return isAacB - isAacA;
      }

      return bitB - bitA;
    })[0];
  }

  /**
   * Finds the highest quality video track matching a target resolution.
   * Filters out premium-only/DRM streams and selects stable, publicly downloadable tracks.
   */
  public findBestVideoFormatForHeight(
    formats: MediaFormatOption[],
    targetHeight: number,
    targetWidth: number = 1920,
    preferredExt: 'mp4' | 'mkv' | 'webm' = 'mp4'
  ): MediaFormatOption | undefined {
    const matchingTracks = formats.filter((f) => {
      if (!f.hasVideo) return false;
      if (f.hasDrm) return false;

      const h = f.height || 0;
      const w = f.width || 0;

      // 1. Exact height match
      if (h === targetHeight) return true;

      // 2. Vertical video match (e.g. 1080x1920 for 1080p, 720x1280 for 720p)
      if (w === targetHeight || (w > 0 && h > 0 && Math.min(w, h) === targetHeight)) return true;

      // 3. Widescreen / Cinemascope match (e.g. 1920x800 for 1080p)
      if (w === targetWidth || (w > 0 && h > 0 && Math.max(w, h) === targetWidth)) return true;

      // 4. Minor dimension tolerance (within 24px)
      if (h > 0 && Math.abs(h - targetHeight) <= 24) return true;
      if (w > 0 && Math.abs(w - targetHeight) <= 24) return true;

      return false;
    });

    if (matchingTracks.length === 0) return undefined;

    // Sort order:
    // 1. Non-premium first (standard public streams: 137, 248, 399, etc. over 617)
    // 2. 60fps over 30fps
    // 3. Preferred container extension match (mp4)
    // 4. AVC/H264 or AV1 codec over others for mp4
    // 5. Bitrate
    return matchingTracks.sort((a, b) => {
      const isPremA = a.isPremium ? 1 : 0;
      const isPremB = b.isPremium ? 1 : 0;
      if (isPremA !== isPremB) return isPremA - isPremB; // Non-premium first

      const fpsA = a.fps || 30;
      const fpsB = b.fps || 30;
      if (fpsB !== fpsA) return fpsB - fpsA;

      const extMatchA = a.ext === preferredExt ? 1 : 0;
      const extMatchB = b.ext === preferredExt ? 1 : 0;
      if (extMatchB !== extMatchA) return extMatchB - extMatchA;

      // Prefer H.264/AVC for MP4 compatibility
      if (preferredExt === 'mp4') {
        const isAvcA = (a.vcodec || '').startsWith('avc') ? 1 : 0;
        const isAvcB = (b.vcodec || '').startsWith('avc') ? 1 : 0;
        if (isAvcB !== isAvcA) return isAvcB - isAvcA;
      }

      return (b.vbr || b.tbr || 0) - (a.vbr || a.tbr || 0);
    })[0];
  }

  /**
   * Generates quality profiles for all available resolutions and audio-only options.
   */
  public buildQualityProfiles(mediaInfo: MediaInfo, preferredContainer: TargetContainer = 'mp4'): QualityProfile[] {
    const formats = mediaInfo.availableFormats || [];
    const profiles: QualityProfile[] = [];
    const bestAudio = this.findBestAudioFormat(formats);
    const seenFormatIds = new Set<string>();

    const isInstagram =
      mediaInfo.platform === 'instagram' ||
      (mediaInfo.originalUrl &&
        (mediaInfo.originalUrl.includes('instagram.com') || mediaInfo.originalUrl.includes('instagr.am')));

    // 1. Check each standard resolution
    for (const res of this.STANDARD_RESOLUTIONS) {
      const videoTrack = this.findBestVideoFormatForHeight(
        formats,
        res.height,
        res.width,
        preferredContainer === 'mkv' ? 'mkv' : 'mp4'
      );

      if (videoTrack && !seenFormatIds.has(videoTrack.formatId)) {
        seenFormatIds.add(videoTrack.formatId);
        const isDash = isInstagram ? false : videoTrack.isDashStream || !videoTrack.hasAudio;
        let estimatedTotalSize: number | undefined;

        if (videoTrack.filesize) {
          estimatedTotalSize = videoTrack.filesize + (isDash && bestAudio?.filesize ? bestAudio.filesize : 0);
        } else if (videoTrack.filesizeApprox) {
          estimatedTotalSize = videoTrack.filesizeApprox + (isDash && bestAudio?.filesizeApprox ? bestAudio.filesizeApprox : 0);
        } else if (mediaInfo.duration && mediaInfo.duration > 0) {
          const vBitrate = videoTrack.tbr || videoTrack.vbr || (res.height >= 2160 ? 15000 : res.height >= 1440 ? 8000 : res.height >= 1080 ? 3500 : res.height >= 720 ? 1800 : 800);
          const aBitrate = bestAudio?.abr || 128;
          estimatedTotalSize = Math.round((mediaInfo.duration * (vBitrate + (isDash ? aBitrate : 0)) * 1000) / 8);
        }

        profiles.push({
          quality: res.quality,
          height: res.height,
          label: `${res.label} ${videoTrack.fps && videoTrack.fps > 30 ? `${videoTrack.fps}fps` : ''}`.trim(),
          videoFormat: videoTrack,
          audioFormat: isDash ? bestAudio : undefined,
          isDash,
          estimatedTotalSize,
          container: preferredContainer === 'webm' ? 'webm' : preferredContainer === 'mkv' ? 'mkv' : 'mp4',
        });
      }
    }

    // 2. Fallback: If no standard profiles were matched, but video formats exist, add the best video tracks
    if (profiles.length === 0) {
      const videoOnlyTracks = formats.filter((f) => f.hasVideo).sort((a, b) => (b.height || 0) - (a.height || 0));
      for (const track of videoOnlyTracks) {
        if (!seenFormatIds.has(track.formatId)) {
          seenFormatIds.add(track.formatId);
          const isDash = isInstagram ? false : track.isDashStream || !track.hasAudio;
          const h = track.height || 720;
          let qKey: StandardQuality = '720p';
          if (h >= 2160) qKey = '2160p';
          else if (h >= 1440) qKey = '1440p';
          else if (h >= 1080) qKey = '1080p';
          else if (h >= 720) qKey = '720p';
          else if (h >= 480) qKey = '480p';
          else qKey = '360p';

          profiles.push({
            quality: qKey,
            height: h,
            label: track.qualityLabel || `${track.resolution || `${h}p`} Video`,
            videoFormat: track,
            audioFormat: isDash ? bestAudio : undefined,
            isDash,
            estimatedTotalSize: track.filesize || track.filesizeApprox,
            container: (track.ext as any) || preferredContainer || 'mp4',
          });
          break; // Take highest quality video
        }
      }
    }

    // 3. Audio-only profile (MP3 / High-quality audio)
    if (bestAudio) {
      profiles.push({
        quality: 'audio_only',
        height: 0,
        label: `Audio Only (${bestAudio.qualityLabel || `${bestAudio.abr || 320}kbps`})`,
        videoFormat: undefined,
        audioFormat: bestAudio,
        isDash: false,
        estimatedTotalSize:
          bestAudio.filesize ||
          bestAudio.filesizeApprox ||
          (mediaInfo.duration && mediaInfo.duration > 0 ? Math.round((mediaInfo.duration * (bestAudio.abr || 192) * 1000) / 8) : undefined),
        container: 'mp3',
      });
    }

    return profiles;
  }

  /**
   * Selects the highest possible video quality profile (or specified target quality).
   */
  public selectBestQuality(
    mediaInfo: MediaInfo,
    targetQuality?: StandardQuality,
    preferredContainer: TargetContainer = 'mp4'
  ): MediaQualitySelectionResult {
    const profiles = this.buildQualityProfiles(mediaInfo, preferredContainer);

    let chosenProfile: QualityProfile | undefined;

    if (targetQuality) {
      chosenProfile = profiles.find((p) => p.quality === targetQuality);
    }

    // Default to best video profile (first in list) or audio-only fallback
    if (!chosenProfile && profiles.length > 0) {
      // If user requested a video quality that wasn't exact, prefer best video profile before audio-only
      const firstVideo = profiles.find((p) => p.quality !== 'audio_only');
      chosenProfile = firstVideo || profiles[0];
    }

    const isAudioOnly = chosenProfile?.quality === 'audio_only';

    return {
      title: mediaInfo.title,
      cleanFileName: mediaInfo.cleanFileName,
      originalUrl: mediaInfo.originalUrl,
      selectedQuality: chosenProfile?.quality || '1080p',
      targetContainer: chosenProfile?.container || preferredContainer,
      videoTrack: chosenProfile?.videoFormat,
      audioTrack: chosenProfile?.audioFormat,
      isDashMergeRequired: chosenProfile?.isDash ?? false,
      isAudioOnly,
      estimatedSizeBytes: chosenProfile?.estimatedTotalSize,
      availableProfiles: profiles,
    };
  }
}

export const formatSelector = new FormatSelector();
