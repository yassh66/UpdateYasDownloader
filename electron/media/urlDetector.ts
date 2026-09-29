import { MediaDetectionResult, SupportedPlatform, MediaType } from './types';

interface PlatformPattern {
  platform: SupportedPlatform;
  patterns: RegExp[];
  idExtractor: (url: string) => string | undefined;
  typeHint: (url: string) => MediaType;
}

const PLATFORM_PATTERNS: PlatformPattern[] = [
  {
    platform: 'youtube',
    patterns: [
      /^(https?:\/\/)?(www\.|m\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/i,
      /^(https?:\/\/)?(www\.|m\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i,
      /^(https?:\/\/)?(www\.|m\.)?youtube\.com\/live\/([a-zA-Z0-9_-]{11})/i,
      /^(https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/i,
      /^(https?:\/\/)?(www\.|m\.)?youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)/i,
      /^(https?:\/\/)?(www\.|m\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/i,
      /^(https?:\/\/)?(www\.|music\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/i,
    ],
    idExtractor: (url: string) => {
      try {
        const parsed = new URL(url);
        if (parsed.hostname.includes('youtu.be')) {
          return parsed.pathname.slice(1).split(/[?#]/)[0];
        }
        if (parsed.pathname.startsWith('/shorts/') || parsed.pathname.startsWith('/live/') || parsed.pathname.startsWith('/embed/')) {
          return parsed.pathname.split('/')[2];
        }
        if (parsed.searchParams.has('v')) {
          return parsed.searchParams.get('v') || undefined;
        }
        if (parsed.searchParams.has('list')) {
          return parsed.searchParams.get('list') || undefined;
        }
      } catch {
        const match = url.match(/(?:v=|shorts\/|live\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
        if (match) return match[1];
      }
      return undefined;
    },
    typeHint: (url: string) => {
      if (url.includes('list=') && !url.includes('watch?v=')) {
        return 'playlist';
      }
      return 'video';
    },
  },
  {
    platform: 'instagram',
    patterns: [
      /^(https?:\/\/)?([a-zA-Z0-9_-]+\.)?instagram\.com\/(p|reel|reels|tv|share)\/([a-zA-Z0-9_-]+)/i,
      /^(https?:\/\/)?([a-zA-Z0-9_-]+\.)?instagram\.com\/([a-zA-Z0-9_.-]+)\/(reel|p|tv)\/([a-zA-Z0-9_-]+)/i,
    ],
    idExtractor: (url: string) => {
      const match = url.match(/instagram\.com\/(?:[a-zA-Z0-9_.-]+\/)?(?:p|reel|reels|tv|share)\/([a-zA-Z0-9_-]+)/i);
      return match ? match[1] : undefined;
    },
    typeHint: () => 'video',
  },
  {
    platform: 'tiktok',
    patterns: [
      /^(https?:\/\/)?([a-zA-Z0-9_-]+\.)?tiktok\.com\/.+/i,
    ],
    idExtractor: (url: string) => {
      const match = url.match(/video\/(\d+)/i) || url.match(/tiktok\.com\/([a-zA-Z0-9_-]+)/i);
      return match ? match[1] : undefined;
    },
    typeHint: () => 'video',
  },
  {
    platform: 'twitter',
    patterns: [
      /^(https?:\/\/)?([a-zA-Z0-9_-]+\.)?(twitter\.com|x\.com)\/(?:[a-zA-Z0-9_]+\/)?(?:i\/)?status\/(\d+)/i,
      /^(https?:\/\/)?([a-zA-Z0-9_-]+\.)?(twitter\.com|x\.com)\/(?:i\/web\/status\/)(\d+)/i,
    ],
    idExtractor: (url: string) => {
      const match = url.match(/status\/(\d+)/i);
      return match ? match[1] : undefined;
    },
    typeHint: () => 'video',
  },
  {
    platform: 'facebook',
    patterns: [
      /^(https?:\/\/)?([a-zA-Z0-9_-]+\.)?facebook\.com\/(watch|reel|reels|video|videos|story\.php|share)\/.+/i,
      /^(https?:\/\/)?([a-zA-Z0-9_-]+\.)?facebook\.com\/watch\/?\?v=\d+/i,
      /^(https?:\/\/)?([a-zA-Z0-9_-]+\.)?facebook\.com\/video\.php\?v=\d+/i,
      /^(https?:\/\/)?([a-zA-Z0-9_-]+\.)?facebook\.com\/[a-zA-Z0-9_.-]+\/videos\/.+/i,
      /^(https?:\/\/)?([a-zA-Z0-9_-]+\.)?fb\.watch\/.+/i,
      /^(https?:\/\/)?([a-zA-Z0-9_-]+\.)?facebook\.com\/story\.php\?.+/i,
    ],
    idExtractor: (url: string) => {
      const match =
        url.match(/(?:videos\/|watch\/?\?v=|video\.php\?v=|reel\/|reels\/)(\d+)/i) ||
        url.match(/fb\.watch\/([a-zA-Z0-9_-]+)/i);
      return match ? match[1] : undefined;
    },
    typeHint: () => 'video',
  },
];

const DIRECT_BINARY_EXTENSIONS = /\.(zip|rar|7z|tar|gz|bz2|xz|iso|dmg|exe|msi|pkg|deb|rpm|bin|pdf|doc|docx|xls|xlsx|ppt|pptx|apk|ipa)(\?.*)?$/i;

/**
 * Checks if a URL points directly to a downloadable binary archive/installer/document.
 * These URLs MUST bypass the media engine and go straight to the direct downloadManager.
 */
export function isDirectBinaryFileUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl.trim());
    return DIRECT_BINARY_EXTENSIONS.test(parsed.pathname);
  } catch {
    return DIRECT_BINARY_EXTENSIONS.test(rawUrl.trim());
  }
}

/**
 * Detects whether a given URL is a known media platform link or generic streaming candidate.
 */
export function detectMediaPlatform(rawUrl: string): MediaDetectionResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return {
      isMediaUrl: false,
      platform: 'direct_file',
      canonicalUrl: '',
      mediaTypeHint: 'direct',
    };
  }

  const trimmed = rawUrl.trim();
  let normalizedUrl = trimmed;

  if (!/^https?:\/\//i.test(trimmed)) {
    normalizedUrl = `https://${trimmed}`;
  }

  // Priority 1: Direct binary files MUST bypass media engine
  if (isDirectBinaryFileUrl(normalizedUrl)) {
    return {
      isMediaUrl: false,
      platform: 'direct_file',
      canonicalUrl: normalizedUrl,
      mediaTypeHint: 'direct',
    };
  }

  // Priority 2: Specialized Known Platforms (YouTube, TikTok, Instagram, Twitter, Facebook)
  for (const rule of PLATFORM_PATTERNS) {
    const isMatch = rule.patterns.some((pattern) => pattern.test(normalizedUrl));
    if (isMatch) {
      return {
        isMediaUrl: true,
        platform: rule.platform,
        canonicalUrl: normalizedUrl,
        mediaTypeHint: rule.typeHint(normalizedUrl),
        videoIdOrId: rule.idExtractor(normalizedUrl),
      };
    }
  }

  // Priority 3: Known streaming site domains (Vimeo, Dailymotion, Twitch, SoundCloud, Bilibili, Reddit, Pinterest, etc.)
  const isGenericMediaHost = /(vimeo\.com|dailymotion\.com|twitch\.tv|soundcloud\.com|bilibili\.com|reddit\.com|pinterest\.com|threads\.net|threads\.com|streamable\.com|vk\.com|rumble\.com|bandcamp\.com)/i.test(normalizedUrl);
  if (isGenericMediaHost) {
    return {
      isMediaUrl: true,
      platform: 'generic_media',
      canonicalUrl: normalizedUrl,
      mediaTypeHint: 'video',
    };
  }

  // Direct video/audio file URLs (e.g. .mp4, .mp3 links) are handled as direct files by default
  const isDirectVideoOrAudio = /\.(mp4|mkv|webm|flv|avi|mov|m4v|mp3|m4a|aac|flac|wav|ogg|opus)(\?.*)?$/i.test(normalizedUrl);
  if (isDirectVideoOrAudio) {
    return {
      isMediaUrl: false,
      platform: 'direct_file',
      canonicalUrl: normalizedUrl,
      mediaTypeHint: 'direct',
    };
  }

  return {
    isMediaUrl: false,
    platform: 'direct_file',
    canonicalUrl: normalizedUrl,
    mediaTypeHint: 'direct',
  };
}

/**
 * Quick helper specifically for checking YouTube URLs.
 */
export function isYouTubeUrl(url: string): boolean {
  const result = detectMediaPlatform(url);
  return result.isMediaUrl && result.platform === 'youtube';
}

/**
 * Quick helper specifically for checking TikTok URLs.
 */
export function isTikTokUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (/^(https?:\/\/)?([a-zA-Z0-9_-]+\.)?tiktok\.com\/.+/i.test(trimmed)) {
    return true;
  }
  const result = detectMediaPlatform(trimmed);
  return result.isMediaUrl && result.platform === 'tiktok';
}

/**
 * Quick helper specifically for checking Instagram URLs.
 */
export function isInstagramUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (/^(https?:\/\/)?([a-zA-Z0-9_-]+\.)?instagram\.com\/.+/i.test(trimmed)) {
    return true;
  }
  const result = detectMediaPlatform(trimmed);
  return result.isMediaUrl && result.platform === 'instagram';
}

/**
 * Quick helper specifically for checking Facebook video / media URLs.
 */
export function isFacebookUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();

  // Fast pattern verification for Facebook media links
  const fbPatterns = [
    /^(https?:\/\/)?([a-zA-Z0-9_-]+\.)?facebook\.com\/(watch|reel|reels|video|videos|story\.php|share)\/.+/i,
    /^(https?:\/\/)?([a-zA-Z0-9_-]+\.)?facebook\.com\/watch\/?\?v=/i,
    /^(https?:\/\/)?([a-zA-Z0-9_-]+\.)?facebook\.com\/video\.php\?v=/i,
    /^(https?:\/\/)?([a-zA-Z0-9_-]+\.)?facebook\.com\/[a-zA-Z0-9_.-]+\/videos\/.+/i,
    /^(https?:\/\/)?([a-zA-Z0-9_-]+\.)?fb\.watch\/.+/i,
    /^(https?:\/\/)?([a-zA-Z0-9_-]+\.)?facebook\.com\/story\.php\?.+/i,
  ];

  if (fbPatterns.some((pattern) => pattern.test(trimmed))) {
    return true;
  }

  const result = detectMediaPlatform(trimmed);
  return result.isMediaUrl && result.platform === 'facebook';
}

/**
 * Quick helper specifically for checking Twitter/X video / media URLs.
 */
export function isTwitterUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();

  // Fast pattern verification for Twitter / X media links (status URLs)
  const twitterPatterns = [
    /^(https?:\/\/)?([a-zA-Z0-9_-]+\.)?(twitter\.com|x\.com)\/(?:[a-zA-Z0-9_]+\/)?(?:i\/)?status\/\d+/i,
    /^(https?:\/\/)?([a-zA-Z0-9_-]+\.)?(twitter\.com|x\.com)\/(?:i\/web\/status\/)\d+/i,
  ];

  if (twitterPatterns.some((pattern) => pattern.test(trimmed))) {
    return true;
  }

  const result = detectMediaPlatform(trimmed);
  return result.isMediaUrl && result.platform === 'twitter';
}



