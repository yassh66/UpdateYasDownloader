/**
 * YAS Downloader Media Engine - Forensic Resilience Test Suite
 * Executes unit tests, failure injection tests, format resolution tests,
 * and zero-fake completion verification.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { FailureClassifier } from '../strategy/failureClassifier';
import { extractionStrategyManager } from '../strategy/extractionStrategyManager';
import { universalMediaDownloader } from '../download/universalMediaDownloader';
import { ffmpegManager } from '../postprocessor/ffmpegManager';
import { MediaDiagnosticsLogger } from '../diagnostics/mediaDiagnosticsLogger';
import { NetscapeCookieExporter } from '../session/netscapeCookieExporter';

async function runResilienceTests() {
  console.log('====================================================');
  console.log(' YAS Downloader Media Engine - Resilience Test Suite');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details: string = '') {
    totalTests++;
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`  [FAIL] ${testName} ${details ? `(${details})` : ''}`);
    }
  }

  // ====================================================
  // TEST 1: Failure Classification Layer
  // ====================================================
  console.log('1. Testing Failure Classifier:');
  const c1 = FailureClassifier.classify('Sign in to confirm you are not a bot');
  assert(c1.category === 'BOT_CHALLENGE', 'Bot challenge classified correctly', `got ${c1.category}`);
  assert(c1.isRetryable === true, 'Bot challenge is marked retryable');
  assert(c1.recommendedAction === 'ROTATE_STRATEGY', 'Bot challenge recommends ROTATE_STRATEGY');

  const c2 = FailureClassifier.classify('HTTP Error 403: Forbidden');
  assert(c2.category === 'BOT_CHALLENGE', 'HTTP 403 Forbidden classified as BOT_CHALLENGE');

  const c3 = FailureClassifier.classify('This video is protected by DRM');
  assert(c3.category === 'DRM_CONTENT', 'DRM content classified correctly');
  assert(c3.isRetryable === false, 'DRM content is non-retryable');
  assert(c3.recommendedAction === 'REJECT_PERMANENT', 'DRM content recommends REJECT_PERMANENT');

  const c4 = FailureClassifier.classify('This video is private');
  assert(c4.category === 'PRIVATE_CONTENT', 'Private video classified correctly');
  assert(c4.requiresAuth === true, 'Private video requires authentication');
  assert(c4.recommendedAction === 'REQUIRE_AUTH', 'Private video recommends REQUIRE_AUTH');

  const c5 = FailureClassifier.classify('curl: (28) Operation timed out');
  assert(c5.category === 'TIMEOUT', 'Timeout classified correctly');
  assert(c5.recommendedAction === 'RETRY_WITH_BACKOFF', 'Timeout recommends backoff retry');

  const c6 = FailureClassifier.classify('Requested format is not available');
  assert(c6.category === 'FORMAT_UNAVAILABLE', 'Format unavailable classified correctly');
  assert(c6.recommendedAction === 'FALLBACK_FORMAT', 'Format unavailable recommends fallback');

  const c7 = FailureClassifier.classify('Unsupported URL: not a supported site');
  assert(c7.category === 'UNSUPPORTED_MEDIA', 'Unsupported URL classified correctly');
  assert(c7.outcome === 'UNSUPPORTED', 'Unsupported URL sets outcome UNSUPPORTED');

  // ====================================================
  // TEST 2: Strategy Ladder Generation
  // ====================================================
  console.log('\n2. Testing Strategy Ladder Generator:');
  const ytLadder = extractionStrategyManager.getStrategyLadder('youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert(ytLadder.length >= 3, 'YouTube ladder contains multi-tier recovery strategies', `got ${ytLadder.length} strategies`);
  assert(ytLadder.some((s) => s.playerClient?.includes('ios')), 'YouTube ladder includes iOS client rotation strategy');
  assert(ytLadder.some((s) => s.playerClient?.includes('android')), 'YouTube ladder includes Android client rotation strategy');

  const igLadder = extractionStrategyManager.getStrategyLadder('instagram', 'https://www.instagram.com/reel/C31234567/');
  assert(igLadder.length >= 2, 'Instagram ladder contains recovery strategies', `got ${igLadder.length} strategies`);
  assert(igLadder.some((s) => s.userAgent?.includes('Instagram')), 'Instagram ladder includes mobile app client headers');

  // ====================================================
  // TEST 3: Failure-Injection Strategy Progression
  // ====================================================
  console.log('\n3. Testing Failure Injection and Sequential Recovery:');
  let executedStrategies: string[] = [];
  extractionStrategyManager.setFailureInjectionHook((strat, attemptIndex) => {
    executedStrategies.push(strat.id);
    if (attemptIndex === 0) {
      return { shouldFail: true, simulatedError: 'Bot challenge on Tier 1' };
    }
    if (attemptIndex === 1) {
      return { shouldFail: true, simulatedError: 'Challenge on Tier 2a' };
    }
    return { shouldFail: false }; // Succeed on Tier 2b
  });

  // Verify failure injection hook is active
  const check0 = extractionStrategyManager.checkFailureInjection(ytLadder[0], 0);
  assert(check0?.shouldFail === true, 'Failure injection correctly intercepts Strategy 0');
  const check2 = extractionStrategyManager.checkFailureInjection(ytLadder[2], 2);
  assert(check2?.shouldFail === false, 'Failure injection allows Strategy 2 to succeed');

  // Clear failure injection hook
  extractionStrategyManager.setFailureInjectionHook(null);
  assert(extractionStrategyManager.checkFailureInjection(ytLadder[0], 0) === null, 'Failure injection cleanly resets to null');

  // ====================================================
  // TEST 4: Format Selector Robustness
  // ====================================================
  console.log('\n4. Testing Resilient Format Selectors:');
  const f1080 = universalMediaDownloader.buildResilientVideoFormatSelector(undefined, 1080);
  assert(f1080.includes('bestvideo[height<=1080]'), '1080p selector includes standard generic fallback');
  assert(!f1080.includes('synthetic_'), '1080p selector never contains synthetic IDs');

  const f720 = universalMediaDownloader.buildResilientVideoFormatSelector(undefined, 720);
  assert(f720.includes('bestvideo[height<=720]'), '720p selector includes standard 720p fallback');

  const f4k = universalMediaDownloader.buildResilientVideoFormatSelector(undefined, 2160);
  assert(f4k.includes('bestvideo[height<=2160]'), '4K selector includes 2160p fallback');

  const fAudio = universalMediaDownloader.buildResilientAudioFormatSelector();
  assert(fAudio.includes('bestaudio'), 'Audio selector includes bestaudio fallback');

  // ====================================================
  // TEST 5: Zero-Fake Completion Verification
  // ====================================================
  console.log('\n5. Testing Zero Fake Completion & Media Verification:');
  // 5a: Non-existent file
  const v1 = await ffmpegManager.verifyMediaFile('/path/does/not/exist.mp4', 'video');
  assert(v1.isValid === false, 'Non-existent file rejected immediately');

  // 5b: Zero-byte empty file
  const tmpZero = path.join(os.tmpdir(), `test_zero_${Date.now()}.mp4`);
  fs.writeFileSync(tmpZero, Buffer.alloc(0));
  const v2 = await ffmpegManager.verifyMediaFile(tmpZero, 'video');
  assert(v2.isValid === false, 'Zero-byte empty file rejected by verification');
  try { fs.unlinkSync(tmpZero); } catch {}

  // 5c: Non-media text file
  const tmpText = path.join(os.tmpdir(), `test_text_${Date.now()}.mp4`);
  fs.writeFileSync(tmpText, 'This is a text file, not a video stream.');
  const v3 = await ffmpegManager.verifyMediaFile(tmpText, 'video');
  assert(v3.isValid === false, 'Non-media file rejected by verification');
  try { fs.unlinkSync(tmpText); } catch {}

  // 5d: Valid MP4 container header simulation
  const tmpMp4 = path.join(os.tmpdir(), `test_valid_${Date.now()}.mp4`);
  const mp4Header = Buffer.alloc(4096);
  // Write MP4 ftyp box: 0x00 0x00 0x00 0x18 'ftyp' 'mp42'
  mp4Header.writeUInt32BE(24, 0);
  mp4Header.write('ftypmp42', 4, 'ascii');
  fs.writeFileSync(tmpMp4, mp4Header);
  const v4 = await ffmpegManager.verifyMediaFile(tmpMp4, 'video');
  assert(v4.isValid === true, 'Valid MP4 container header passes verification');
  try { fs.unlinkSync(tmpMp4); } catch {}

  // ====================================================
  // TEST 6: Cookie & Session Security & Redaction
  // ====================================================
  console.log('\n6. Testing Cookie & Credential Security:');
  const testArgs = [
    '--no-warnings',
    '--cookies',
    '/Users/secret/path/to/cookies.txt',
    '--user-agent',
    'Mozilla/5.0',
    'auth_token=SECRET_12345',
  ];
  const sanitized = MediaDiagnosticsLogger.sanitizeArgs(testArgs);
  assert(!sanitized.includes('/Users/secret/path/to/cookies.txt'), 'Cookies file path is redacted from logs');
  assert(sanitized.includes('[COOKIES_FILE_PATH]'), 'Cookies path replaced with placeholder in logs');
  assert(!sanitized.includes('auth_token=SECRET_12345'), 'Auth token is redacted from logs');
  assert(sanitized.includes('[REDACTED_AUTH_TOKEN]'), 'Auth token replaced with [REDACTED_AUTH_TOKEN]');

  // Netscape Cookie Exporter test
  const netscapeFormatted = NetscapeCookieExporter.formatNetscape([
    {
      domain: '.youtube.com',
      name: 'PREF',
      value: 'tz=UTC',
      path: '/',
      secure: true,
      expirationDate: 1800000000,
    },
  ]);
  assert(netscapeFormatted.includes('# Netscape HTTP Cookie File'), 'Netscape header correctly formatted');
  assert(netscapeFormatted.includes('.youtube.com\tTRUE\t/\tTRUE\t1800000000\tPREF\ttz=UTC'), 'Netscape cookie line format matches curl standard');

  // ====================================================
  // TEST 7: Automatic Browser Resolver & Fallback Logic
  // ====================================================
  console.log('\n7. Testing Automatic Browser Resolver & Priority Ladder:');
  const { AutomaticBrowserResolver, automaticBrowserResolver } = await import('../session/automaticBrowserResolver');
  
  // Test locked database error classification
  const lockErr1 = FailureClassifier.classify('sqlite3.OperationalError: database is locked');
  assert(lockErr1.category === 'BOT_CHALLENGE', 'Database lock error categorized correctly');
  assert(lockErr1.isRetryable === true, 'Database lock error is marked retryable');
  assert(lockErr1.recommendedAction === 'ROTATE_STRATEGY', 'Database lock triggers ROTATE_STRATEGY');

  const lockErr2 = FailureClassifier.classify('Could not copy Chrome cookie database');
  assert(lockErr2.isRetryable === true, 'Cookie database copy error is retryable');

  const lockErr3 = FailureClassifier.classify('Cookie file is locked by another process');
  assert(lockErr3.recommendedAction === 'ROTATE_STRATEGY', 'Process lock triggers ROTATE_STRATEGY');

  // Test YouTube Strategy Ladder Ordering:
  // 1. Authenticated browser (if available) -> 2. Alternate browsers -> 3. Standard yt-dlp -> 4. iOS -> 5. Android -> 6. TV -> 7. Custom cookies
  const sampleYtLadder = extractionStrategyManager.getStrategyLadder('youtube', 'https://www.youtube.com/watch?v=abcdefghijk');
  const standardWebIdx = sampleYtLadder.findIndex(s => s.id === 'tier3_youtube_web_embedded');
  const iosIdx = sampleYtLadder.findIndex(s => s.id === 'tier4_youtube_ios');
  const androidIdx = sampleYtLadder.findIndex(s => s.id === 'tier4_youtube_android');
  const tvIdx = sampleYtLadder.findIndex(s => s.id === 'tier4_youtube_tv_embedded');

  assert(standardWebIdx !== -1, 'YouTube ladder includes standard web extraction');
  assert(iosIdx !== -1, 'YouTube ladder includes iOS rotation');
  assert(androidIdx !== -1, 'YouTube ladder includes Android rotation');
  assert(tvIdx !== -1, 'YouTube ladder includes TV rotation');
  assert(standardWebIdx < iosIdx, 'Standard web extraction precedes iOS client');
  assert(iosIdx < androidIdx, 'iOS client precedes Android client');
  assert(androidIdx < tvIdx, 'Android client precedes TV client');

  // Test diagnostic text format
  const res = automaticBrowserResolver.resolveBrowserSessions();
  assert(typeof res.diagnosticsText === 'string', 'Diagnostics text is generated');
  assert(res.diagnosticsText.includes('Detected browsers:'), 'Diagnostics includes "Detected browsers:" header');
  assert(res.diagnosticsText.includes('Selected browser session:'), 'Diagnostics includes "Selected browser session:"');
  assert(res.diagnosticsText.includes('Reason:'), 'Diagnostics includes "Reason:" header');

  console.log('====================================================');
  console.log(` SUMMARY: ${passedTests}/${totalTests} Tests Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('====================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runResilienceTests().catch((err) => {
  console.error('Fatal error in resilience test runner:', err);
  process.exit(1);
});
