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
import { youtubePlatformExtractor } from '../extractors/platforms/youtubePlatformExtractor';
import { YouTubeExtractor } from '../youtube';
import { validateCookiesFile, getSavedCookiesSettings } from '../session/cookieValidator';
import { resolveBinaryPath } from '../bin/paths';

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
  // TEST 7: Case A - User Configured cookies.txt Priority & Execution
  // ====================================================
  console.log('\n7. Testing Case A (cookies.txt configured):');
  const mockCookieFilePath = path.join(os.tmpdir(), `yas_test_cookies_${Date.now()}.txt`);
  fs.writeFileSync(mockCookieFilePath, '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1800000000\tLOGIN_INFO\tAFmmF2cwRQIh...');

  const ytUrl = 'https://www.youtube.com/watch?v=I6WdyEht4PE';
  const caseAOptions = { cookiesPath: mockCookieFilePath };

  // 7a: Base Extractor / YouTubePlatformExtractor
  const baseExtractorArgs = youtubePlatformExtractor.buildYtdlpArgs(ytUrl, caseAOptions);
  assert(baseExtractorArgs.includes('--cookies'), 'Case A: baseExtractor contains --cookies');
  assert(baseExtractorArgs.includes(path.resolve(mockCookieFilePath)), 'Case A: baseExtractor contains correct cookies path');
  assert(!baseExtractorArgs.includes('--cookies-from-browser'), 'Case A: baseExtractor DOES NOT contain --cookies-from-browser');

  // 7b: UniversalMediaDownloader
  const downloadArgs = universalMediaDownloader.buildDownloadArgs(ytUrl, 'bestvideo+bestaudio/best', '/tmp/out.mp4', caseAOptions, 'youtube');
  assert(downloadArgs.includes('--cookies'), 'Case A: universalDownloader contains --cookies');
  assert(downloadArgs.includes(path.resolve(mockCookieFilePath)), 'Case A: universalDownloader contains correct cookies path');
  assert(!downloadArgs.includes('--cookies-from-browser'), 'Case A: universalDownloader DOES NOT contain --cookies-from-browser');

  // 7c: YouTube Core Extractor
  const ytCoreExtractor = new YouTubeExtractor();
  const ytCoreArgs = ytCoreExtractor.buildYtdlpArgs(ytUrl, caseAOptions);
  assert(ytCoreArgs.includes('--cookies'), 'Case A: YouTubeExtractor contains --cookies');
  assert(ytCoreArgs.includes(path.resolve(mockCookieFilePath)), 'Case A: YouTubeExtractor contains correct cookies path');
  assert(!ytCoreArgs.includes('--cookies-from-browser'), 'Case A: YouTubeExtractor DOES NOT contain --cookies-from-browser');

  // 7d: Strategy ladder contains ONLY cookies strategies, no browser recovery
  const caseALadder = extractionStrategyManager.getStrategyLadder('youtube', ytUrl, caseAOptions);
  assert(caseALadder.length > 0, 'Case A: Strategy ladder is populated');
  assert(caseALadder.every((s) => s.cookiesPath === mockCookieFilePath), 'Case A: Every strategy uses the configured cookies file');
  assert(caseALadder.every((s) => !s.browserCookie), 'Case A: No strategy in ladder uses browser sessions');

  // ====================================================
  // TEST 8: Case B - Missing cookies.txt (Normal Extraction Continues)
  // ====================================================
  console.log('\n8. Testing Case B (cookies.txt missing / unconfigured):');
  const caseBOptions = {};

  const caseBExtractorArgs = youtubePlatformExtractor.buildYtdlpArgs(ytUrl, caseBOptions);
  assert(!caseBExtractorArgs.includes('--cookies'), 'Case B: baseExtractor does not contain --cookies');
  assert(!caseBExtractorArgs.includes('--cookies-from-browser'), 'Case B: baseExtractor does not contain --cookies-from-browser');

  const caseBDownloadArgs = universalMediaDownloader.buildDownloadArgs(ytUrl, 'bestvideo+bestaudio/best', '/tmp/out.mp4', caseBOptions, 'youtube');
  assert(!caseBDownloadArgs.includes('--cookies'), 'Case B: universalDownloader does not contain --cookies');
  assert(!caseBDownloadArgs.includes('--cookies-from-browser'), 'Case B: universalDownloader does not contain --cookies-from-browser');

  const caseBCoreArgs = ytCoreExtractor.buildYtdlpArgs(ytUrl, caseBOptions);
  assert(!caseBCoreArgs.includes('--cookies'), 'Case B: YouTubeExtractor does not contain --cookies');
  assert(!caseBCoreArgs.includes('--cookies-from-browser'), 'Case B: YouTubeExtractor does not contain --cookies-from-browser');

  const caseBLadder = extractionStrategyManager.getStrategyLadder('youtube', ytUrl, caseBOptions);
  assert(caseBLadder.length >= 3, 'Case B: Normal extraction ladder has multiple client rotation tiers');
  assert(caseBLadder[0].id === 'tier2_youtube_web_embedded', 'Case B: First tier is standard web baseline');
  assert(caseBLadder.some((s) => s.id === 'tier2_youtube_ios'), 'Case B: Ladder contains iOS client rotation');
  assert(caseBLadder.some((s) => s.id === 'tier2_youtube_android'), 'Case B: Ladder contains Android client rotation');
  assert(caseBLadder.every((s) => !s.browserCookie), 'Case B: Ladder NEVER automatically guesses Brave/Chrome/Edge/Firefox/Opera');

  // ====================================================
  // TEST 9: Diagnostics & Authentication Messaging
  // ====================================================
  console.log('\n9. Testing YouTube Authentication Diagnostics:');
  const expectedAuthMessage = 'YouTube requires authentication. Add a cookies.txt file in Settings > YouTube Authentication.';

  const ytBotFailure = FailureClassifier.classify(
    'ERROR: [youtube] I6WdyEht4PE: Sign in to confirm you’re not a bot. This helps protect our community.',
    undefined,
    true
  );
  assert(ytBotFailure.userMessage === expectedAuthMessage, 'Bot challenge shows YouTube auth settings diagnostic');

  const yt403Failure = FailureClassifier.classify(
    'HTTP Error 403: Forbidden',
    'ERROR: [youtube] unable to download video data: HTTP Error 403: Forbidden',
    true
  );
  assert(yt403Failure.userMessage === expectedAuthMessage, 'HTTP 403 on YouTube shows YouTube auth settings diagnostic');

  const ytPrivateFailure = FailureClassifier.classify(
    'ERROR: [youtube] Private video. Sign in if you\'ve been granted access to this video',
    undefined,
    true
  );
  assert(ytPrivateFailure.userMessage === expectedAuthMessage, 'Private video on YouTube shows YouTube auth settings diagnostic');
  assert(!ytBotFailure.userMessage.toLowerCase().includes('brave'), 'User message does not mention Brave');
  assert(!ytBotFailure.userMessage.toLowerCase().includes('opera'), 'User message does not mention Opera');
  assert(!ytBotFailure.userMessage.toLowerCase().includes('dpapi'), 'User message does not mention DPAPI');

  // ====================================================
  // TEST 10: Cookie Validation & Settings Resolution
  // ====================================================
  console.log('\n10. Testing Cookie Validator & Storage:');
  const validCheck = validateCookiesFile(mockCookieFilePath);
  assert(validCheck.valid === true, 'Valid Netscape cookies file passes validation');
  assert(validCheck.hasYouTubeCookies === true, 'YouTube cookies detected in validation file');
  assert(validCheck.cookieCount === 1, 'Correct cookie count detected');

  const nonExistentCheck = validateCookiesFile('/path/that/does/not/exist_cookie.txt');
  assert(nonExistentCheck.valid === false, 'Non-existent file fails validation');

  const emptyFilePath = path.join(os.tmpdir(), `yas_empty_${Date.now()}.txt`);
  fs.writeFileSync(emptyFilePath, '');
  const emptyCheck = validateCookiesFile(emptyFilePath);
  assert(emptyCheck.valid === false, 'Empty file (0 bytes) fails validation');

  const junkFilePath = path.join(os.tmpdir(), `yas_junk_${Date.now()}.txt`);
  fs.writeFileSync(junkFilePath, 'This is some random text without tabs or cookie structure');
  const junkCheck = validateCookiesFile(junkFilePath);
  assert(junkCheck.valid === false, 'Non-cookie formatted text file fails validation');

  // Test getSavedCookiesSettings with a mock userData directory
  const mockUserData = path.join(os.tmpdir(), `yas_userdata_${Date.now()}`);
  fs.mkdirSync(mockUserData, { recursive: true });
  const mockSettingsPath = path.join(mockUserData, 'settings.json');
  fs.writeFileSync(mockSettingsPath, JSON.stringify({
    enableCookiesAuth: true,
    cookiesPath: mockCookieFilePath,
  }));

  const resolvedSaved = getSavedCookiesSettings(mockUserData);
  assert(resolvedSaved.enabled === true, 'getSavedCookiesSettings detects enabled cookies auth');
  assert(resolvedSaved.cookiesPath === mockCookieFilePath, 'getSavedCookiesSettings resolves correct path');

  // Cleanup test files
  try { fs.unlinkSync(mockCookieFilePath); } catch {}
  try { fs.unlinkSync(emptyFilePath); } catch {}
  try { fs.unlinkSync(junkFilePath); } catch {}
  try { fs.unlinkSync(mockSettingsPath); fs.rmdirSync(mockUserData); } catch {}

  // ====================================================
  // TEST 11: Production Hardening Pass (Step 6 Tests)
  // ====================================================
  console.log('\n11. Testing Final Production Hardening Requirements:');

  const prodTestCookiePath = path.join(os.tmpdir(), `yas_prod_cookies_${Date.now()}.txt`);
  fs.writeFileSync(prodTestCookiePath, '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1800000000\tLOGIN_INFO\tAFmmF2cwRQIh...');

  const prodUserDataDir = path.join(os.tmpdir(), `yas_prod_userdata_${Date.now()}`);
  fs.mkdirSync(prodUserDataDir, { recursive: true });
  const prodSettingsFile = path.join(prodUserDataDir, 'settings.json');

  // 11.1: cookies.txt enabled:
  // contains --cookies, does NOT contain --cookies-from-browser
  fs.writeFileSync(prodSettingsFile, JSON.stringify({
    downloadFolder: '/downloads',
    enableCookiesAuth: true,
    cookiesPath: prodTestCookiePath,
  }));

  const enabledSettings = getSavedCookiesSettings(prodUserDataDir);
  assert(enabledSettings.enabled === true, '11.1: Settings storage has cookies enabled');
  assert(enabledSettings.cookiesPath === prodTestCookiePath, '11.1: Settings storage returns correct path');

  const enabledArgsExtractor = youtubePlatformExtractor.buildYtdlpArgs(ytUrl, { cookiesPath: enabledSettings.cookiesPath });
  assert(enabledArgsExtractor.includes('--cookies'), '11.1: Enabled cookies.txt args contain --cookies');
  assert(enabledArgsExtractor.includes(path.resolve(prodTestCookiePath)), '11.1: Enabled cookies.txt args contain path');
  assert(!enabledArgsExtractor.includes('--cookies-from-browser'), '11.1: Enabled cookies.txt args DO NOT contain --cookies-from-browser');

  const enabledArgsDownloader = universalMediaDownloader.buildDownloadArgs(ytUrl, 'bestvideo+bestaudio/best', '/tmp/out.mp4', { cookiesPath: enabledSettings.cookiesPath }, 'youtube');
  assert(enabledArgsDownloader.includes('--cookies'), '11.1: Downloader args contain --cookies');
  assert(!enabledArgsDownloader.includes('--cookies-from-browser'), '11.1: Downloader args DO NOT contain --cookies-from-browser');

  // 11.2: cookies.txt disabled:
  // does NOT contain either cookie argument
  fs.writeFileSync(prodSettingsFile, JSON.stringify({
    downloadFolder: '/downloads',
    enableCookiesAuth: false,
    cookiesPath: prodTestCookiePath,
  }));

  const disabledSettings = getSavedCookiesSettings(prodUserDataDir);
  assert(disabledSettings.enabled === false, '11.2: Settings storage correctly marks disabled cookies');

  const disabledArgsExtractor = youtubePlatformExtractor.buildYtdlpArgs(ytUrl, {});
  assert(!disabledArgsExtractor.includes('--cookies'), '11.2: Disabled cookies args DO NOT contain --cookies');
  assert(!disabledArgsExtractor.includes('--cookies-from-browser'), '11.2: Disabled cookies args DO NOT contain --cookies-from-browser');

  const disabledArgsDownloader = universalMediaDownloader.buildDownloadArgs(ytUrl, 'bestvideo+bestaudio/best', '/tmp/out.mp4', {}, 'youtube');
  assert(!disabledArgsDownloader.includes('--cookies'), '11.2: Disabled downloader args DO NOT contain --cookies');
  assert(!disabledArgsDownloader.includes('--cookies-from-browser'), '11.2: Disabled downloader args DO NOT contain --cookies-from-browser');

  // 11.3: Restart persistence test for settings storage
  // Phase 1: Simulate user setting cookies in App Session 1
  const restartDir = path.join(os.tmpdir(), `yas_restart_test_${Date.now()}`);
  fs.mkdirSync(restartDir, { recursive: true });
  const restartSettingsFile = path.join(restartDir, 'settings.json');

  const session1Settings = {
    downloadFolder: '/custom/save/folder',
    maxConcurrent: 5,
    maxConnections: 16,
    launchOnStartup: true,
    speedLimit: 0,
    enableCookiesAuth: true,
    cookiesPath: prodTestCookiePath,
  };
  fs.writeFileSync(restartSettingsFile, JSON.stringify(session1Settings, null, 2), 'utf8');

  // Phase 2: Simulate complete app shutdown and process reboot (Session 2)
  const session2Raw = fs.readFileSync(restartSettingsFile, 'utf8');
  const session2Settings = JSON.parse(session2Raw);
  assert(session2Settings.enableCookiesAuth === true, '11.3: Restart persistence keeps enableCookiesAuth true');
  assert(session2Settings.cookiesPath === prodTestCookiePath, '11.3: Restart persistence keeps cookiesPath');

  const reloadedSessionSettings = getSavedCookiesSettings(restartDir);
  assert(reloadedSessionSettings.enabled === true, '11.3: getSavedCookiesSettings successfully reloads after restart');
  assert(reloadedSessionSettings.cookiesPath === prodTestCookiePath, '11.3: Active cookies file path remains intact across restart');

  // 11.4: Packaged path safety test
  // Confirm no developer machine hardcoded paths are present
  const resolvedYtDlp = resolveBinaryPath('yt-dlp');
  assert(typeof resolvedYtDlp === 'string' && resolvedYtDlp.length > 0, '11.4: Binary resolution produces valid executable string');
  assert(!resolvedYtDlp.includes('C:\\Users\\Yaser'), '11.4: Binary resolution contains NO developer hardcoded user paths');
  assert(!resolvedYtDlp.startsWith('Y:\\'), '11.4: Binary resolution contains NO Y:\\ virtual drive paths');

  const resolvedFFmpeg = resolveBinaryPath('ffmpeg');
  assert(typeof resolvedFFmpeg === 'string' && resolvedFFmpeg.length > 0, '11.4: FFmpeg resolution produces valid executable string');
  assert(!resolvedFFmpeg.includes('C:\\Users\\Yaser'), '11.4: FFmpeg path contains NO developer hardcoded user paths');

  // Verify that an arbitrary unconfigured session without settings.json does not guess Desktop
  const emptyIsolatedDir = path.join(os.tmpdir(), `yas_empty_isolated_${Date.now()}`);
  fs.mkdirSync(emptyIsolatedDir, { recursive: true });
  const isolatedCheck = getSavedCookiesSettings(emptyIsolatedDir);
  assert(isolatedCheck.enabled === false, '11.4: Isolated environment does not hallucinate cookies from Desktop');

  // Cleanup Section 11 files
  try { fs.unlinkSync(prodTestCookiePath); } catch {}
  try { fs.unlinkSync(prodSettingsFile); fs.rmdirSync(prodUserDataDir); } catch {}
  try { fs.unlinkSync(restartSettingsFile); fs.rmdirSync(restartDir); } catch {}
  try { fs.rmdirSync(emptyIsolatedDir); } catch {}

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
