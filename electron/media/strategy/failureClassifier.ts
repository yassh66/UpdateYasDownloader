export type FailureCategory =
  | 'BOT_CHALLENGE'
  | 'AUTH_REQUIRED'
  | 'PRIVATE_CONTENT'
  | 'GEO_RESTRICTION'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'FORMAT_UNAVAILABLE'
  | 'EXTRACTION_ERROR'
  | 'DOWNLOAD_ERROR'
  | 'FFMPEG_ERROR'
  | 'VERIFICATION_ERROR'
  | 'UNSUPPORTED_MEDIA'
  | 'DRM_CONTENT'
  | 'UNKNOWN_ERROR';

export type StrategyOutcome =
  | 'SUCCESS'
  | 'RETRYABLE_FAILURE'
  | 'AUTH_REQUIRED'
  | 'UNSUPPORTED'
  | 'PERMANENT_FAILURE';

export type RecommendedAction =
  | 'ROTATE_STRATEGY'
  | 'RETRY_WITH_BACKOFF'
  | 'FALLBACK_FORMAT'
  | 'REQUIRE_AUTH'
  | 'REJECT_PERMANENT';

export interface ClassifiedFailure {
  category: FailureCategory;
  outcome: StrategyOutcome;
  userMessage: string;
  isRetryable: boolean;
  requiresAuth: boolean;
  recommendedAction: RecommendedAction;
  rawMessage: string;
}

export class FailureClassifier {
  /**
   * Classifies an error message or stderr output into a structured category
   * and determines the optimal recovery action.
   */
  public static classify(errorOrMessage: any, stderr?: string): ClassifiedFailure {
    const raw = typeof errorOrMessage === 'string'
      ? errorOrMessage
      : `${errorOrMessage?.message || ''}\n${errorOrMessage?.stderr || ''}\n${stderr || ''}`;
    const combined = raw.toLowerCase();

    // 1. DRM Protected Content
    if (
      combined.includes('drm') ||
      combined.includes('has_drm') ||
      combined.includes('widevine') ||
      combined.includes('protected by digital rights') ||
      combined.includes('encryp')
    ) {
      return {
        category: 'DRM_CONTENT',
        outcome: 'PERMANENT_FAILURE',
        userMessage: 'This content is protected by DRM encryption and cannot be downloaded.',
        isRetryable: false,
        requiresAuth: false,
        recommendedAction: 'REJECT_PERMANENT',
        rawMessage: raw,
      };
    }

    // 2. Private Content
    if (
      combined.includes('private video') ||
      combined.includes('this video is private') ||
      combined.includes('account is private') ||
      combined.includes('subscriber_only') ||
      combined.includes('only accessible to members')
    ) {
      return {
        category: 'PRIVATE_CONTENT',
        outcome: 'AUTH_REQUIRED',
        userMessage: 'This media is private and requires account authorization.',
        isRetryable: false,
        requiresAuth: true,
        recommendedAction: 'REQUIRE_AUTH',
        rawMessage: raw,
      };
    }

    // 3. Cookie Database Lock / Inaccessible Browser Cookies
    if (
      combined.includes('database is locked') ||
      combined.includes('could not copy cookie') ||
      combined.includes('cookie database') ||
      combined.includes('unable to extract cookies') ||
      combined.includes('extracting cookies from') ||
      combined.includes('cookie file is locked') ||
      combined.includes('failed to decrypt cookie') ||
      combined.includes('dpapi decryption failed') ||
      (combined.includes('permission denied') && combined.includes('cookie')) ||
      (combined.includes('used by another process') && combined.includes('cookie'))
    ) {
      return {
        category: 'BOT_CHALLENGE',
        outcome: 'RETRYABLE_FAILURE',
        userMessage: 'Browser session locked or in-use. Transitioning to next recovery strategy...',
        isRetryable: true,
        requiresAuth: false,
        recommendedAction: 'ROTATE_STRATEGY',
        rawMessage: raw,
      };
    }

    // 4. Bot Challenge & Verification Blockage
    if (
      combined.includes('sign in to confirm') ||
      combined.includes('not a bot') ||
      combined.includes('bot confirmation') ||
      combined.includes('confirm your age') ||
      combined.includes('checkpoint_required') ||
      combined.includes('challenge_required') ||
      combined.includes('http error 403') ||
      combined.includes('403: forbidden') ||
      combined.includes('403 forbidden')
    ) {
      return {
        category: 'BOT_CHALLENGE',
        outcome: 'RETRYABLE_FAILURE',
        userMessage: 'Anti-bot verification encountered. Rotating client strategy...',
        isRetryable: true,
        requiresAuth: false,
        recommendedAction: 'ROTATE_STRATEGY',
        rawMessage: raw,
      };
    }

    // 4. Authentication Required
    if (
      combined.includes('login required') ||
      combined.includes('login to view') ||
      combined.includes('login with your instagram account') ||
      combined.includes('please sign in') ||
      combined.includes('requires authentication')
    ) {
      return {
        category: 'AUTH_REQUIRED',
        outcome: 'AUTH_REQUIRED',
        userMessage: 'Authentication required. Attempting session/cookie recovery...',
        isRetryable: true,
        requiresAuth: true,
        recommendedAction: 'ROTATE_STRATEGY',
        rawMessage: raw,
      };
    }

    // 5. Geo Restriction
    if (
      combined.includes('not available in your country') ||
      combined.includes('geo-blocked') ||
      combined.includes('georestricted') ||
      combined.includes('not available in your region')
    ) {
      return {
        category: 'GEO_RESTRICTION',
        outcome: 'PERMANENT_FAILURE',
        userMessage: 'This media is not available in your region (geo-restricted).',
        isRetryable: false,
        requiresAuth: false,
        recommendedAction: 'REJECT_PERMANENT',
        rawMessage: raw,
      };
    }

    // 6. Format Unavailable
    if (
      combined.includes('requested format is not available') ||
      combined.includes('only images are available') ||
      combined.includes('no video formats found') ||
      combined.includes('format not available')
    ) {
      return {
        category: 'FORMAT_UNAVAILABLE',
        outcome: 'RETRYABLE_FAILURE',
        userMessage: 'Selected quality format unavailable. Falling back to alternative format...',
        isRetryable: true,
        requiresAuth: false,
        recommendedAction: 'FALLBACK_FORMAT',
        rawMessage: raw,
      };
    }

    // 7. Timeouts
    if (
      combined.includes('timed out') ||
      combined.includes('curl: (28)') ||
      combined.includes('connection timed out') ||
      combined.includes('operation timed out') ||
      combined.includes('socket timeout')
    ) {
      return {
        category: 'TIMEOUT',
        outcome: 'RETRYABLE_FAILURE',
        userMessage: 'Connection timed out. Retrying with backoff...',
        isRetryable: true,
        requiresAuth: false,
        recommendedAction: 'RETRY_WITH_BACKOFF',
        rawMessage: raw,
      };
    }

    // 8. Network Errors
    if (
      combined.includes('network is unreachable') ||
      combined.includes('econnreset') ||
      combined.includes('enotfound') ||
      combined.includes('failed to connect') ||
      combined.includes('could not resolve host')
    ) {
      return {
        category: 'NETWORK_ERROR',
        outcome: 'RETRYABLE_FAILURE',
        userMessage: 'Network connection error. Retrying...',
        isRetryable: true,
        requiresAuth: false,
        recommendedAction: 'RETRY_WITH_BACKOFF',
        rawMessage: raw,
      };
    }

    // 9. Verification Failures
    if (
      combined.includes('verification failed') ||
      combined.includes('missing valid video streams') ||
      combined.includes('missing valid audio streams') ||
      combined.includes('corrupted') ||
      combined.includes('empty or corrupted')
    ) {
      return {
        category: 'VERIFICATION_ERROR',
        outcome: 'RETRYABLE_FAILURE',
        userMessage: 'File verification failed. Retrying stream download...',
        isRetryable: true,
        requiresAuth: false,
        recommendedAction: 'FALLBACK_FORMAT',
        rawMessage: raw,
      };
    }

    // 10. Unsupported URL / Media
    if (
      combined.includes('unsupported url') ||
      combined.includes('is not a valid url') ||
      combined.includes('no suitable extractor found')
    ) {
      return {
        category: 'UNSUPPORTED_MEDIA',
        outcome: 'UNSUPPORTED',
        userMessage: 'This media format or URL is not supported.',
        isRetryable: false,
        requiresAuth: false,
        recommendedAction: 'REJECT_PERMANENT',
        rawMessage: raw,
      };
    }

    // 11. General Rate Limit / 429
    if (combined.includes('429') || combined.includes('too many requests')) {
      return {
        category: 'NETWORK_ERROR',
        outcome: 'RETRYABLE_FAILURE',
        userMessage: 'Too many requests. Rotating client connection...',
        isRetryable: true,
        requiresAuth: false,
        recommendedAction: 'ROTATE_STRATEGY',
        rawMessage: raw,
      };
    }

    // Default Fallback
    return {
      category: 'UNKNOWN_ERROR',
      outcome: 'RETRYABLE_FAILURE',
      userMessage: 'Encountered unexpected extraction issue. Attempting alternative recovery...',
      isRetryable: true,
      requiresAuth: false,
      recommendedAction: 'ROTATE_STRATEGY',
      rawMessage: raw,
    };
  }
}
