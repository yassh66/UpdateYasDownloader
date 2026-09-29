#!/usr/bin/env node
/**
 * YAS Downloader — Binary Setup & Verification Tool
 * 
 * Verifies the presence of required media binaries (yt-dlp.exe, ffmpeg.exe) in bin/win-x64/
 * and automatically downloads official yt-dlp.exe and ffmpeg.exe if missing.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const binDir = path.join(rootDir, 'bin');
const winX64Dir = path.join(binDir, 'win-x64');

// Ensure directory tree exists
if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
if (!fs.existsSync(winX64Dir)) fs.mkdirSync(winX64Dir, { recursive: true });

const YTDLP_WIN_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
// Standalone Windows x64 FFmpeg binary release (GPL essentials build) with fallback mirrors
const FFMPEG_URLS = [
  'https://github.com/GyanD/codexffmpeg/releases/download/7.1/ffmpeg-7.1-essentials_build.zip',
  'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
];

const targetYtdlpPath = path.join(winX64Dir, 'yt-dlp.exe');
const targetFfmpegPath = path.join(winX64Dir, 'ffmpeg.exe');

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function isBinaryValid(filePath, minSizeBytes) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size >= minSizeBytes;
  } catch {
    return false;
  }
}

function downloadToFile(url, destPath, label = 'file') {
  return new Promise((resolve, reject) => {
    const tempDest = `${destPath}.tmp_${Date.now()}`;
    const file = fs.createWriteStream(tempDest);
    
    function makeRequest(currentUrl, redirectCount = 0) {
      if (redirectCount > 10) {
        file.close();
        try { fs.unlinkSync(tempDest); } catch {}
        return reject(new Error('Too many redirects while downloading ' + label));
      }

      const client = currentUrl.startsWith('https') ? https : http;
      client.get(currentUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) YAS-Downloader-Setup/1.0',
        },
      }, (res) => {
        // Handle 3xx Redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const nextUrl = new URL(res.headers.location, currentUrl).href;
          return makeRequest(nextUrl, redirectCount + 1);
        }

        if (res.statusCode !== 200) {
          file.close();
          try { fs.unlinkSync(tempDest); } catch {}
          return reject(new Error(`Server returned HTTP ${res.statusCode}: ${res.statusMessage}`));
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0) {
            const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
            process.stdout.write(`\rDownloading ${label}: ${percent}% (${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)})`);
          } else {
            process.stdout.write(`\rDownloading ${label}: ${formatBytes(downloadedBytes)}`);
          }
        });

        res.pipe(file);

        file.on('finish', () => {
          file.close(() => {
            try {
              if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
              fs.renameSync(tempDest, destPath);
            } catch (e) {
              // On Windows rename across devices fallback
              fs.copyFileSync(tempDest, destPath);
              try { fs.unlinkSync(tempDest); } catch {}
            }
            console.log(`\n ${label} download complete!`);
            resolve();
          });
        });
      }).on('error', (err) => {
        file.close();
        try { fs.unlinkSync(tempDest); } catch {}
        reject(err);
      });
    }

    makeRequest(url);
  });
}

/**
 * Minimal in-memory ZIP extractor for extracting a single file (e.g. ffmpeg.exe)
 * without external dependencies.
 */
async function extractFfmpegFromZip(zipPath, destExePath) {
  console.log(`Extracting ffmpeg.exe from ${zipPath}...`);
  const buffer = fs.readFileSync(zipPath);
  
  // Find End of Central Directory Record (EOCD)
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('Could not find EOCD in zip file.');
  }

  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  const cdRecords = buffer.readUInt16LE(eocdOffset + 10);

  let currentOffset = cdOffset;
  let targetEntry = null;

  for (let i = 0; i < cdRecords; i++) {
    if (buffer.readUInt32LE(currentOffset) !== 0x02014b50) break;

    const method = buffer.readUInt16LE(currentOffset + 10);
    const compSize = buffer.readUInt32LE(currentOffset + 20);
    const uncompSize = buffer.readUInt32LE(currentOffset + 24);
    const fileNameLen = buffer.readUInt16LE(currentOffset + 28);
    const extraLen = buffer.readUInt16LE(currentOffset + 30);
    const commentLen = buffer.readUInt16LE(currentOffset + 32);
    const localHeaderOffset = buffer.readUInt32LE(currentOffset + 42);

    const fileName = buffer.toString('utf8', currentOffset + 46, currentOffset + 46 + fileNameLen);

    if (fileName.toLowerCase().endsWith('/ffmpeg.exe') || fileName.toLowerCase().endsWith('\\ffmpeg.exe') || fileName.toLowerCase() === 'ffmpeg.exe') {
      targetEntry = {
        fileName,
        method,
        compSize,
        uncompSize,
        localHeaderOffset,
      };
      break;
    }

    currentOffset += 46 + fileNameLen + extraLen + commentLen;
  }

  if (!targetEntry) {
    throw new Error('ffmpeg.exe was not found inside the zip archive.');
  }

  // Read Local File Header
  const lfhOffset = targetEntry.localHeaderOffset;
  if (buffer.readUInt32LE(lfhOffset) !== 0x04034b50) {
    throw new Error('Invalid local file header signature.');
  }

  const localFileNameLen = buffer.readUInt16LE(lfhOffset + 26);
  const localExtraLen = buffer.readUInt16LE(lfhOffset + 28);
  const dataOffset = lfhOffset + 30 + localFileNameLen + localExtraLen;
  const compressedData = buffer.subarray(dataOffset, dataOffset + targetEntry.compSize);

  let outputData;
  if (targetEntry.method === 0) {
    // Uncompressed
    outputData = compressedData;
  } else if (targetEntry.method === 8) {
    // Deflate
    outputData = zlib.inflateRawSync(compressedData);
  } else {
    throw new Error(`Unsupported compression method: ${targetEntry.method}`);
  }

  fs.writeFileSync(destExePath, outputData);
  console.log(` ffmpeg.exe successfully extracted (${formatBytes(outputData.length)}) to: ${destExePath}`);
}

async function ensureYtdlp() {
  const MIN_YTDLP_SIZE = 5 * 1024 * 1024; // 5 MB minimum
  const isValid = isBinaryValid(targetYtdlpPath, MIN_YTDLP_SIZE) || isBinaryValid(path.join(binDir, 'yt-dlp.exe'), MIN_YTDLP_SIZE);
  
  if (!isValid) {
    console.log(`yt-dlp.exe is missing or invalid. Downloading official binary...`);
    try {
      if (fs.existsSync(targetYtdlpPath)) fs.unlinkSync(targetYtdlpPath);
    } catch {}
    await downloadToFile(YTDLP_WIN_URL, targetYtdlpPath, 'yt-dlp.exe');
  } else {
    console.log(` yt-dlp.exe is present and verified.`);
  }
}

async function ensureFfmpeg() {
  const MIN_FFMPEG_SIZE = 25 * 1024 * 1024; // 25 MB minimum
  const isValid = isBinaryValid(targetFfmpegPath, MIN_FFMPEG_SIZE) || isBinaryValid(path.join(binDir, 'ffmpeg.exe'), MIN_FFMPEG_SIZE);
  
  if (!isValid) {
    console.log(`ffmpeg.exe is missing or invalid. Downloading official Windows build...`);
    try {
      if (fs.existsSync(targetFfmpegPath)) fs.unlinkSync(targetFfmpegPath);
    } catch {}

    const tempZip = path.join(winX64Dir, 'ffmpeg_temp.zip');
    let succeeded = false;
    let lastError = null;

    for (const url of FFMPEG_URLS) {
      try {
        console.log(`Attempting FFmpeg download from: ${url}`);
        await downloadToFile(url, tempZip, 'ffmpeg.zip');
        await extractFfmpegFromZip(tempZip, targetFfmpegPath);
        succeeded = true;
        break;
      } catch (err) {
        lastError = err;
        console.warn(`Failed downloading FFmpeg from ${url}: ${err.message}`);
      } finally {
        if (fs.existsSync(tempZip)) {
          try { fs.unlinkSync(tempZip); } catch {}
        }
      }
    }

    if (!succeeded) {
      throw lastError || new Error('Failed to download and extract ffmpeg.exe from all available mirrors.');
    }
  } else {
    console.log(` ffmpeg.exe is present and verified.`);
  }
}

async function main() {
  console.log('====================================================');
  console.log('  YAS Downloader — Media Binary Setup & Packaging');
  console.log('====================================================\n');

  let hasError = false;

  try {
    await ensureYtdlp();
  } catch (err) {
    hasError = true;
    console.error(` Error ensuring yt-dlp: ${err.message}`);
  }

  try {
    await ensureFfmpeg();
  } catch (err) {
    hasError = true;
    console.error(` Error ensuring FFmpeg: ${err.message}`);
  }

  const ytdlpOk = fs.existsSync(targetYtdlpPath);
  const ffmpegOk = fs.existsSync(targetFfmpegPath);

  console.log('\n--- Status Summary ---');
  console.log(`yt-dlp.exe in bin/win-x64: ${ytdlpOk ? ' AVAILABLE' : ' NOT FOUND'}`);
  console.log(`ffmpeg.exe in bin/win-x64: ${ffmpegOk ? ' AVAILABLE' : ' NOT FOUND'}`);
  console.log('====================================================\n');

  if (hasError || !ytdlpOk || !ffmpegOk) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal setup error:', err);
  process.exit(1);
});

