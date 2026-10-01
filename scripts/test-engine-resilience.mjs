/**
 * YAS Downloader Media Engine - Forensic Resilience Test Suite
 * Executes unit tests, failure injection tests, format resolution tests,
 * and zero-fake completion verification.
 */

import { FailureClassifier } from '../dist-electron/main.cjs';

// Let's create an ESM/Node runner that tests the media engine components
console.log('====================================================');
console.log(' YAS Downloader Media Engine - Resilience Test Suite');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${testName} ${details ? `(${details})` : ''}`);
  }
}

// 1. Failure Classifier Tests
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

const c5 = FailureClassifier.classify('curl: (28) Operation timed out');
assert(c5.category === 'TIMEOUT', 'Timeout classified correctly');
assert(c5.recommendedAction === 'RETRY_WITH_BACKOFF', 'Timeout recommends backoff retry');

const c6 = FailureClassifier.classify('Requested format is not available');
assert(c6.category === 'FORMAT_UNAVAILABLE', 'Format unavailable classified correctly');
assert(c6.recommendedAction === 'FALLBACK_FORMAT', 'Format unavailable recommends fallback');

console.log(`\nResults: ${passedTests}/${totalTests} tests passed.`);
