# YAS Downloader — External Binaries Directory

This directory contains external executable binaries required by the Media Engine for streaming extraction, video/audio downloading, and media format post-processing.

## Folder Structure

```text
bin/
├── win-x64/
│   ├── yt-dlp.exe      (Required: Media extraction & streaming download engine)
│   ├── ffmpeg.exe      (Recommended: Lossless DASH stream merging, audio conversion to MP3/M4A)
│   └── ffprobe.exe     (Optional: Media stream inspection)
└── README.md
```

## Binary Placement Instructions for Windows x64

### 1. yt-dlp (`yt-dlp.exe`)
- **Download**: [yt-dlp Official GitHub Releases](https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe)
- **Destination**: `bin/win-x64/yt-dlp.exe` (or `bin/yt-dlp.exe`)
- **Role**: Extracts metadata, playlists, format trees, and streams from YouTube, TikTok, Instagram, Twitter/X, Facebook, and 1000+ other supported platforms.

### 2. FFmpeg (`ffmpeg.exe` and `ffprobe.exe`)
- **Download**: [Gyan.dev FFmpeg Windows Builds](https://www.gyan.dev/ffmpeg/builds/) or [BtbN FFmpeg Builds](https://github.com/BtbN/FFmpeg-Builds/releases)
- **Destination**: `bin/win-x64/ffmpeg.exe` and `bin/win-x64/ffprobe.exe`
- **Role**: Lossless stream merging for 1080p/2K/4K DASH streams and conversion to MP3 (320kbps), M4A, FLAC, and AAC.

---

## Automated Download Helper

You can automatically download the latest official `yt-dlp.exe` by running:

```bash
npm run setup:bin
```

---

## Packaging with Electron Builder

When you run:
```bash
npm run dist:win
```
`electron-builder` packages everything inside `bin/` into `dist-app/win-unpacked/resources/bin/` via the `extraResources` configuration in `package.json`.
At runtime, YAS Downloader automatically detects and executes binaries from `process.resourcesPath/bin/`.
