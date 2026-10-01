import React, { useState, useEffect, useRef } from 'react';
import { 
  Youtube, 
  Video, 
  Music, 
  Sparkles, 
  Check, 
  Folder, 
  AlertCircle, 
  Loader2, 
  X, 
  Clock,
  User,
  Download,
  CheckCircle2,
  Pause,
  Play,
  RotateCcw,
  ExternalLink,
  Clipboard,
  Trash2,
  Film,
  Layers,
  FileCheck2,
  HardDrive,
  Minimize2
} from 'lucide-react';
import GlassButton from './GlassButton';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useMediaDownload } from '../context/MediaDownloadContext';

interface MediaDownloadDialogProps {
  isOpen?: boolean;
  initialUrl?: string;
  onClose?: () => void;
  onMinimize?: () => void;
  onPrepareDownload?: (options: any) => void;
}

export type DownloadUIStage = 
  | 'idle'
  | 'ready'
  | 'extracting'
  | 'downloading_video'
  | 'downloading_audio'
  | 'downloading_stream'
  | 'merging_streams'
  | 'converting_audio'
  | 'verifying'
  | 'retrying'
  | 'completed'
  | 'paused'
  | 'cancelled'
  | 'error';

export default function MediaDownloadDialog(props: MediaDownloadDialogProps = {}) {
  const { 
    isMediaModalOpen, 
    currentUrl, 
    activeJob,
    setActiveJob, 
    minimizeMediaDialog, 
    closeMediaDialog 
  } = useMediaDownload();

  const isOpen = props.isOpen !== undefined ? props.isOpen : isMediaModalOpen;
  const initialUrl = props.initialUrl !== undefined ? props.initialUrl : currentUrl;
  const onClose = props.onClose || closeMediaDialog;
  const onMinimize = props.onMinimize || minimizeMediaDialog;
  const onPrepareDownload = props.onPrepareDownload;

  const [url, setUrl] = useState(initialUrl || '');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [mediaInfo, setMediaInfo] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'video' | 'audio'>('video');
  const [selectedQuality, setSelectedQuality] = useState<string>('1080p');
  const [selectedContainer, setSelectedContainer] = useState<'mp4' | 'mkv' | 'webm' | 'mp3' | 'm4a'>('mp4');
  const [saveFolder, setSaveFolder] = useState<string>('C:\\Downloads');
  const [cookiesPath, setCookiesPath] = useState<string | undefined>(undefined);
  const [qualityProfiles, setQualityProfiles] = useState<any[]>([]);

  // Active Download Pipeline State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [downloadStage, setDownloadStage] = useState<DownloadUIStage>('idle');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadSpeed, setDownloadSpeed] = useState<string>('');
  const [downloadEta, setDownloadEta] = useState<string>('');
  const [downloadedBytes, setDownloadedBytes] = useState<number | undefined>(undefined);
  const [totalBytes, setTotalBytes] = useState<number | undefined>(undefined);
  const [completedFilePath, setCompletedFilePath] = useState<string | null>(null);
  const [downloadErrorMessage, setDownloadErrorMessage] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const latestAnalysisId = useRef<number>(0);
  const { theme } = useTheme();
  const { t, language } = useLanguage();
  const isLight = theme === 'light';
  const isRTL = language === 'fa';

  const getMediaEngine = () => window.mediaEngine || (window as any).electron?.mediaEngine;

  const handleMinimize = () => {
    if (onMinimize) {
      onMinimize();
    } else {
      minimizeMediaDialog();
    }
  };

  const handleCloseOrMinimize = () => {
    if (isDownloading || isPaused || mediaInfo) {
      handleMinimize();
    } else {
      if (onClose) onClose();
      else closeMediaDialog();
    }
  };

  // Outside-click detection without blocking interaction with the rest of the application
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent | MouseEvent) => {
      const target = event.target as Node;
      // Do nothing if click is inside the dialog element
      if (dialogRef.current && dialogRef.current.contains(target)) {
        return;
      }

      // Do nothing if click is on the floating mini indicator
      const miniEl = document.getElementById('mini-media-indicator');
      if (miniEl && miniEl.contains(target)) {
        return;
      }

      // Do nothing if click is on any media download trigger button
      const triggerEl = (target as HTMLElement)?.closest?.('[data-media-trigger="true"]');
      if (triggerEl) {
        return;
      }

      // Hide/minimize the dialog immediately when clicking anywhere outside
      // Note: event naturally propagates to whatever button/element the user clicked
      handleMinimize();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [isOpen, onMinimize, minimizeMediaDialog]);

  const isInstagram = (rawUrl: string): boolean => {
    if (!rawUrl) return false;
    return /^(https?:\/\/)?([a-zA-Z0-9_-]+\.)?instagram\.com\/.+/i.test(rawUrl.trim()) || rawUrl.toLowerCase().includes('instagram.com');
  };

  const sanitizeInstagramUrl = (rawUrl: string): string => {
    if (!rawUrl) return rawUrl;
    try {
      const parsed = new URL(rawUrl.trim());
      if (/instagram\.com/i.test(parsed.hostname)) {
        const trackingParams = ['igsh', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src', 'igshid'];
        for (const param of trackingParams) {
          parsed.searchParams.delete(param);
        }
        return parsed.toString();
      }
    } catch {}
    return rawUrl.trim();
  };

  // Synchronize state immediately from activeJob when restoring dialog
  useEffect(() => {
    if (isOpen && activeJob) {
      if (activeJob.status === 'completed') return; // Do not restore completed items
      if (activeJob.id) setActiveJobId(activeJob.id);
      setIsDownloading(activeJob.status === 'downloading');
      setIsPaused(activeJob.status === 'paused');
      if (activeJob.stage) setDownloadStage(activeJob.stage as any);
      else if (activeJob.status) setDownloadStage(activeJob.status as any);
      if (activeJob.percent !== undefined) setDownloadProgress(activeJob.percent);
      if (activeJob.speed) setDownloadSpeed(activeJob.speed);
      if (activeJob.eta) setDownloadEta(activeJob.eta);
      if (activeJob.downloadedBytes) setDownloadedBytes(activeJob.downloadedBytes);
      if (activeJob.totalBytes) setTotalBytes(activeJob.totalBytes);
      if (activeJob.outputPath) setCompletedFilePath(activeJob.outputPath);
      if (activeJob.error) setDownloadErrorMessage(activeJob.error);
      if (activeJob.mediaInfo) setMediaInfo(activeJob.mediaInfo);
      if (activeJob.url && !url) setUrl(activeJob.url);
    }
  }, [isOpen, activeJob]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleMinimize();
    }
  };

  // Reset entire dialog state for a fresh URL
  const resetState = (newUrl: string = '') => {
    latestAnalysisId.current = ++latestAnalysisId.current;
    setUrl(newUrl);
    setIsExtracting(false);
    setExtractError(null);
    setMediaInfo(null);
    setQualityProfiles([]);
    setActiveJobId(null);
    setIsDownloading(false);
    setIsPaused(false);
    setDownloadStage('idle');
    setDownloadProgress(0);
    setDownloadSpeed('');
    setDownloadEta('');
    setDownloadedBytes(undefined);
    setTotalBytes(undefined);
    setCompletedFilePath(null);
    setDownloadErrorMessage(null);
    setActiveTab('video');
    setSelectedQuality('1080p');
    setSelectedContainer('mp4');
    setActiveJob(null);
  };

  // Sync initialUrl
  useEffect(() => {
    if (isOpen) {
      if (initialUrl && initialUrl !== url && !isDownloading) {
        resetState(initialUrl);
        handleExtract(initialUrl);
      }
    }
  }, [isOpen, initialUrl]);

  // Load default download folder and cookies configuration on mount/open
  useEffect(() => {
    if (isOpen && window.electronAPI?.getSettings) {
      window.electronAPI.getSettings().then((s) => {
        if (s?.downloadFolder) setSaveFolder(s.downloadFolder);
        if (s?.cookiesPath) setCookiesPath(s.cookiesPath);
      }).catch(() => {});
    }
  }, [isOpen]);

  // Check active jobs and reconnect ONLY to actively running or paused jobs
  useEffect(() => {
    const engine = getMediaEngine();
    if (isOpen && engine?.getActiveDownloads) {
      engine.getActiveDownloads().then((jobs: any) => {
        if (Array.isArray(jobs) && jobs.length > 0) {
          const activeOnly = jobs.filter((j: any) => j.status === 'downloading' || j.status === 'paused');
          const matching = initialUrl 
            ? activeOnly.find((j: any) => j.url === initialUrl) 
            : activeOnly[0];
          
          if (matching) {
            setActiveJobId(matching.id);
            setIsDownloading(matching.status === 'downloading');
            setIsPaused(matching.status === 'paused');
            setDownloadStage((matching.stage || matching.status) as any);
            setDownloadProgress(matching.percent || 0);
            if (matching.speed) setDownloadSpeed(matching.speed);
            if (matching.eta) setDownloadEta(matching.eta);
            if (matching.downloadedBytes) setDownloadedBytes(matching.downloadedBytes);
            if (matching.totalBytes) setTotalBytes(matching.totalBytes);
            if (matching.outputPath) setCompletedFilePath(matching.outputPath);
            if (matching.error) setDownloadErrorMessage(matching.error);
            if (matching.mediaInfo) setMediaInfo(matching.mediaInfo);
            if (matching.url) setUrl(matching.url);

            setActiveJob(matching);
          }
        }
      }).catch(console.error);
    }
  }, [isOpen, initialUrl]);

  // Hook up IPC progress, completion, error, and job state updates
  useEffect(() => {
    if (!isOpen) return;

    let unsubProgress: (() => void) | undefined;
    let unsubComplete: (() => void) | undefined;
    let unsubError: (() => void) | undefined;
    let unsubJobUpdate: (() => void) | undefined;

    const engine = getMediaEngine();

    if (engine?.onDownloadProgress || engine?.onProgress) {
      const progressHandler = engine.onDownloadProgress || engine.onProgress;
      unsubProgress = progressHandler((data: any) => {
        if (activeJobId && data.jobId && data.jobId !== activeJobId) return;
        if (data.stage) setDownloadStage(data.stage);
        if (data.percent !== undefined) setDownloadProgress(Math.round(data.percent));
        if (data.speed !== undefined) setDownloadSpeed(data.speed);
        if (data.eta !== undefined) setDownloadEta(data.eta);
        if (data.downloadedBytes !== undefined) setDownloadedBytes(data.downloadedBytes);
        if (data.totalBytes !== undefined) setTotalBytes(data.totalBytes);
        if (data.outputPath) setCompletedFilePath(data.outputPath);
        if (data.jobId && !activeJobId) setActiveJobId(data.jobId);
      });
    }

    if (engine?.onDownloadComplete || engine?.onComplete) {
      const completeHandler = engine.onDownloadComplete || engine.onComplete;
      unsubComplete = completeHandler((data: any) => {
        if (activeJobId && data.jobId && data.jobId !== activeJobId) return;
        setIsDownloading(false);
        setIsPaused(false);
        setDownloadStage('completed');
        setDownloadProgress(100);
        setDownloadSpeed('');
        setDownloadEta('');
        if (data.outputPath) setCompletedFilePath(data.outputPath);
        setActiveJob(null);
      });
    }

    if (engine?.onDownloadError || engine?.onError) {
      const errorHandler = engine.onDownloadError || engine.onError;
      unsubError = errorHandler((data: any) => {
        if (activeJobId && data.jobId && data.jobId !== activeJobId) return;
        setIsDownloading(false);
        setIsPaused(false);
        setDownloadStage('error');
        setDownloadErrorMessage(data.error || 'Failed to download media stream.');
      });
    }

    if (engine?.onJobUpdate) {
      unsubJobUpdate = engine.onJobUpdate((job: any) => {
        if (activeJobId && job.id !== activeJobId) return;
        if (job.status === 'downloading') {
          setIsDownloading(true);
          setIsPaused(false);
        } else if (job.status === 'paused') {
          setIsDownloading(false);
          setIsPaused(true);
          setDownloadStage('paused');
          setDownloadSpeed('0 B/s');
          setDownloadEta('');
        } else if (job.status === 'completed') {
          setIsDownloading(false);
          setIsPaused(false);
          setDownloadStage('completed');
          setDownloadProgress(100);
          if (job.outputPath) setCompletedFilePath(job.outputPath);
          setActiveJob(null);
        } else if (job.status === 'cancelled') {
          setIsDownloading(false);
          setIsPaused(false);
          setDownloadStage('cancelled');
          setDownloadErrorMessage(job.error || 'Download was cancelled.');
        } else if (job.status === 'error') {
          setIsDownloading(false);
          setIsPaused(false);
          setDownloadStage('error');
          setDownloadErrorMessage(job.error || 'Media download error.');
        }

        if (job.stage) setDownloadStage(job.stage as any);
        if (job.percent !== undefined) setDownloadProgress(Math.round(job.percent));
        if (job.speed !== undefined) setDownloadSpeed(job.speed);
        if (job.eta !== undefined) setDownloadEta(job.eta);
        if (job.outputPath) setCompletedFilePath(job.outputPath);
      });
    }

    return () => {
      unsubProgress?.();
      unsubComplete?.();
      unsubError?.();
      unsubJobUpdate?.();
    };
  }, [isOpen, activeJobId]);

  if (!isOpen) return null;

  const handleExtract = async (targetUrl?: string) => {
    const rawCheckUrl = (targetUrl || url).trim();
    if (!rawCheckUrl) return;

    const isInsta = isInstagram(rawCheckUrl);
    const checkUrl = isInsta ? sanitizeInstagramUrl(rawCheckUrl) : rawCheckUrl;
    if (checkUrl !== url) {
      setUrl(checkUrl);
    }

    const currentAnalysisId = ++latestAnalysisId.current;

    setIsExtracting(true);
    setExtractError(null);
    setMediaInfo(null);
    setQualityProfiles([]);
    setDownloadStage('idle');
    setDownloadProgress(0);
    setCompletedFilePath(null);
    setDownloadErrorMessage(null);
    setIsDownloading(false);
    setIsPaused(false);
    setActiveJobId(null);
    setActiveJob(null);

    const engine = getMediaEngine();

    try {
      if (engine?.extractInfo) {
        const extractionOptions = cookiesPath ? { cookiesPath } : undefined;
        const res = await engine.extractInfo(checkUrl, extractionOptions);
        if (currentAnalysisId !== latestAnalysisId.current) return;

        if (res?.success && res.data) {
          const info = res.data;
          setMediaInfo(info);

          if (engine.getFormats) {
            const formatRes = await engine.getFormats(info, '1080p', selectedContainer);
            if (currentAnalysisId !== latestAnalysisId.current) return;

            if (formatRes?.success && formatRes.data?.availableProfiles && formatRes.data.availableProfiles.length > 0) {
              setQualityProfiles(formatRes.data.availableProfiles);
              setSelectedQuality(formatRes.data.selectedQuality || '1080p');
            } else if (info.availableFormats && info.availableFormats.length > 0) {
              buildFallbackProfilesFromFormats(info);
            }
          } else if (info.availableFormats && info.availableFormats.length > 0) {
            buildFallbackProfilesFromFormats(info);
          }
        } else {
          setExtractError(
            res?.error ||
            (isInsta
              ? 'Instagram extraction timed out or failed. Please check your connection, VPN, or login cookies.'
              : 'Could not extract metadata from this URL. Please verify the link or check Settings -> Browser Session if authentication is required.')
          );
        }
      } else {
        // Mock fallback for web browser preview
        setTimeout(() => {
          if (currentAnalysisId !== latestAnalysisId.current) return;
          const mockInfo = {
            id: isInsta ? 'insta_sample_123' : 'dQw4w9WgXcQ',
            title: isInsta ? 'Instagram Reel Video' : 'Sample High-Definition Video Stream',
            cleanFileName: isInsta ? 'Instagram_Reel_Video' : 'Sample_High_Definition_Video_Stream',
            platform: isInsta ? 'instagram' : 'youtube',
            uploader: isInsta ? 'instagram_user' : 'Official Channel',
            duration: isInsta ? 45 : 245,
            formattedDuration: isInsta ? '0:45' : '4:05',
            thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
          };
          setMediaInfo(mockInfo);
          setQualityProfiles([
            { quality: '1080p', label: 'Full HD (1080p)', estimatedTotalSize: 45000000, container: 'mp4', isDash: false },
            { quality: '720p', label: 'HD (720p)', estimatedTotalSize: 22000000, container: 'mp4', isDash: false },
            { quality: 'audio_only', label: 'Audio Only (MP3 320kbps)', estimatedTotalSize: 1800000, container: 'mp3', isDash: false },
          ]);
          setIsExtracting(false);
        }, 500);
        return;
      }
    } catch (err: any) {
      if (currentAnalysisId === latestAnalysisId.current) {
        setExtractError(err.message || 'Communication failure with Media Engine.');
      }
    } finally {
      if (currentAnalysisId === latestAnalysisId.current) {
        setIsExtracting(false);
      }
    }
  };

  const buildFallbackProfilesFromFormats = (info: any) => {
    const profiles: any[] = [];
    const seenQualities = new Set<string>();
    const isInsta = info?.platform === 'instagram' || isInstagram(info?.originalUrl || url);
    const sorted = [...(info.availableFormats || [])].sort((a: any, b: any) => (b.height || 0) - (a.height || 0));

    for (const f of sorted) {
      if (f.hasVideo) {
        const h = f.height || 0;
        let qKey = '720p';
        let qLabel = 'HD (720p)';
        if (h >= 2160) { qKey = '2160p'; qLabel = '4K Ultra HD (2160p)'; }
        else if (h >= 1440) { qKey = '1440p'; qLabel = '2K Quad HD (1440p)'; }
        else if (h >= 1080) { qKey = '1080p'; qLabel = 'Full HD (1080p)'; }
        else if (h >= 720) { qKey = '720p'; qLabel = 'HD (720p)'; }
        else if (h >= 480) { qKey = '480p'; qLabel = 'SD (480p)'; }
        else { qKey = '360p'; qLabel = 'Low (360p)'; }

        if (!seenQualities.has(qKey)) {
          seenQualities.add(qKey);
          profiles.push({
            quality: qKey,
            label: qLabel,
            estimatedTotalSize: f.filesize || f.filesizeApprox || (info.duration ? info.duration * (h >= 1080 ? 450000 : 200000) : 0),
            container: f.ext || 'mp4',
            isDash: isInsta ? false : f.isDashStream || !f.hasAudio,
          });
        }
      }
    }

    // Audio Option
    profiles.push({
      quality: 'audio_only',
      label: 'Audio Only (MP3 320kbps)',
      estimatedTotalSize: Math.round((info.duration || 180) * 40000),
      container: 'mp3',
      isDash: false,
    });

    setQualityProfiles(profiles);
    if (profiles.length > 0) {
      setSelectedQuality(profiles[0].quality);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        const clean = text.trim();
        resetState(clean);
        handleExtract(clean);
      }
    } catch {
      inputRef.current?.focus();
    }
  };

  const handleSelectFolder = async () => {
    try {
      if (window.electronAPI?.selectFolder) {
        const folder = await window.electronAPI.selectFolder();
        if (folder) setSaveFolder(folder);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleStartRealDownload = async () => {
    if (!mediaInfo && !url) return;

    const newJobId = `media_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    setActiveJobId(newJobId);
    setIsDownloading(true);
    setIsPaused(false);
    setDownloadStage('extracting');
    setDownloadProgress(2);
    setDownloadErrorMessage(null);
    setCompletedFilePath(null);

    const actualQuality = activeTab === 'audio' ? 'audio_only' : selectedQuality;
    const actualContainer = activeTab === 'audio' ? (selectedContainer === 'm4a' ? 'm4a' : 'mp3') : selectedContainer;

    const downloadPayload = {
      jobId: newJobId,
      url: mediaInfo?.originalUrl || url,
      title: mediaInfo?.title || 'Media Download',
      cleanFileName: mediaInfo?.cleanFileName || 'media_download',
      quality: actualQuality,
      container: actualContainer,
      saveFolder,
      cookiesPath,
      mediaInfo,
    };

    setActiveJob({
      id: newJobId,
      url: downloadPayload.url,
      title: downloadPayload.title,
      cleanFileName: downloadPayload.cleanFileName,
      quality: actualQuality,
      container: actualContainer,
      saveFolder,
      status: 'downloading',
      stage: 'extracting',
      percent: 2,
      speed: '',
      eta: '',
      startTime: Date.now(),
      mediaInfo,
    });

    if (onPrepareDownload) {
      onPrepareDownload(downloadPayload);
    }

    const engine = getMediaEngine();

    try {
      if (engine?.startDownload) {
        const result = await engine.startDownload(downloadPayload);
        if (result?.success) {
          setIsDownloading(false);
          setIsPaused(false);
          setDownloadStage('completed');
          setDownloadProgress(100);
          setCompletedFilePath(result.outputPath || null);
          // Clear activeJob in context so it does not persist in active dialog memory
          setActiveJob(null);
        } else if (result?.error !== 'Download paused') {
          // Check if Instagram media URL expired and retry once with fresh extraction
          const isInsta = isInstagram(url);
          if (isInsta && (result?.error?.includes('403') || result?.error?.includes('410') || result?.error?.includes('expired') || result?.error?.includes('Forbidden'))) {
            const extractionOptions = cookiesPath ? { cookiesPath } : undefined;
            const freshRes = await engine.extractInfo(url, extractionOptions);
            if (freshRes?.success && freshRes.data) {
              setMediaInfo(freshRes.data);
              const retryPayload = {
                ...downloadPayload,
                mediaInfo: freshRes.data,
              };
              const retryResult = await engine.startDownload(retryPayload);
              if (retryResult?.success) {
                setIsDownloading(false);
                setIsPaused(false);
                setDownloadStage('completed');
                setDownloadProgress(100);
                setCompletedFilePath(retryResult.outputPath || null);
                setActiveJob(null);
                return;
              }
            }
          }
          setIsDownloading(false);
          setDownloadStage('error');
          setDownloadErrorMessage(result?.error || 'Download failed.');
          setActiveJob(null);
        }
      } else {
        // Fallback simulation for browser environment
        let currentProg = 5;
        const interval = setInterval(() => {
          currentProg += 12;
          if (currentProg < 45) {
            setDownloadStage('downloading_video');
            setDownloadSpeed('14.2 MB/s');
            setDownloadEta('00:08');
            setDownloadProgress(currentProg);
            setActiveJob((prev: any) => prev ? ({ ...prev, percent: currentProg, speed: '14.2 MB/s', eta: '00:08', stage: 'downloading_video' }) : null);
          } else if (currentProg < 80) {
            setDownloadStage('downloading_audio');
            setDownloadSpeed('6.8 MB/s');
            setDownloadEta('00:03');
            setDownloadProgress(currentProg);
            setActiveJob((prev: any) => prev ? ({ ...prev, percent: currentProg, speed: '6.8 MB/s', eta: '00:03', stage: 'downloading_audio' }) : null);
          } else if (currentProg < 98) {
            setDownloadStage('merging_streams');
            setDownloadSpeed('Lossless FFmpeg Mux');
            setDownloadEta('00:01');
            setDownloadProgress(currentProg);
            setActiveJob((prev: any) => prev ? ({ ...prev, percent: currentProg, speed: 'FFmpeg Mux', eta: '00:01', stage: 'merging_streams' }) : null);
          } else {
            clearInterval(interval);
            setIsDownloading(false);
            setDownloadStage('completed');
            setDownloadProgress(100);
            setDownloadSpeed('');
            setDownloadEta('');
            const donePath = `${saveFolder}\\${mediaInfo?.cleanFileName || 'video'}.${actualContainer}`;
            setCompletedFilePath(donePath);
            setActiveJob(null);
          }
        }, 350);
      }
    } catch (err: any) {
      if (!isPaused) {
        setIsDownloading(false);
        setDownloadStage('error');
        setDownloadErrorMessage(err.message || 'Media Engine execution error');
        setActiveJob(null);
      }
    }
  };

  const handlePauseDownload = async () => {
    const engine = getMediaEngine();
    if (activeJobId && engine?.pauseDownload) {
      try {
        await engine.pauseDownload(activeJobId);
        setIsDownloading(false);
        setIsPaused(true);
        setDownloadStage('paused');
        setDownloadSpeed('0 B/s');
        setDownloadEta('');
        setActiveJob((prev: any) => prev ? ({ ...prev, status: 'paused', stage: 'paused', speed: '0 B/s' }) : null);
      } catch (err) {
        console.error('Pause failed:', err);
      }
    } else {
      setIsDownloading(false);
      setIsPaused(true);
      setDownloadStage('paused');
      setActiveJob((prev: any) => prev ? ({ ...prev, status: 'paused', stage: 'paused' }) : null);
    }
  };

  const handleResumeDownload = async () => {
    const engine = getMediaEngine();
    if (activeJobId && engine?.resumeDownload) {
      try {
        setIsDownloading(true);
        setIsPaused(false);
        setDownloadStage('downloading_video');
        setDownloadErrorMessage(null);
        setActiveJob((prev: any) => prev ? ({ ...prev, status: 'downloading', stage: 'downloading_video', error: undefined }) : null);
        const result = await engine.resumeDownload(activeJobId);
        if (result?.success) {
          setIsDownloading(false);
          setDownloadStage('completed');
          setDownloadProgress(100);
          if (result.outputPath) setCompletedFilePath(result.outputPath);
          setActiveJob((prev: any) => prev ? ({ ...prev, status: 'completed', stage: 'completed', percent: 100, outputPath: result.outputPath }) : null);
        } else if (result?.error !== 'Download paused') {
          setIsDownloading(false);
          setDownloadStage('error');
          setDownloadErrorMessage(result?.error || 'Failed to resume.');
          setActiveJob((prev: any) => prev ? ({ ...prev, status: 'error', stage: 'error', error: result?.error }) : null);
        }
      } catch (err: any) {
        console.error('Resume failed:', err);
        setIsDownloading(false);
        setDownloadStage('error');
        setDownloadErrorMessage(err.message || 'Resume failed.');
      }
    } else {
      setIsDownloading(true);
      setIsPaused(false);
      setDownloadStage('downloading_video');
    }
  };

  const handleCancelActiveDownload = async () => {
    const cancelTargetJobId = activeJobId;
    
    // Immediately clear all UI state so the active card disappears completely and instantly
    setIsDownloading(false);
    setIsPaused(false);
    setDownloadStage('ready');
    setDownloadProgress(0);
    setDownloadSpeed('');
    setDownloadEta('');
    setDownloadedBytes(undefined);
    setTotalBytes(undefined);
    setDownloadErrorMessage(null);
    setActiveJob(null);
    setActiveJobId(null);

    const engine = getMediaEngine();
    if (cancelTargetJobId && engine?.cancelDownload) {
      try {
        await engine.cancelDownload(cancelTargetJobId);
      } catch (err) {
        console.error('Cancel download error:', err);
      }
    }
  };

  const handleOpenFile = async () => {
    const engine = getMediaEngine();
    if (completedFilePath) {
      if (engine?.openFile) {
        await engine.openFile(completedFilePath);
      } else if (window.electronAPI?.openFile) {
        await window.electronAPI.openFile(completedFilePath);
      }
    }
  };

  const handleOpenFolder = async () => {
    const engine = getMediaEngine();
    if (completedFilePath) {
      if (engine?.openFolder) {
        await engine.openFolder(completedFilePath);
      } else if (window.electronAPI?.openFolder) {
        await window.electronAPI.openFolder(completedFilePath);
      }
    }
  };

  function formatBytes(bytes?: number): string {
    if (!bytes || bytes <= 0) return 'Dynamic Size';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }

  function getPlatformBadge(platform?: string) {
    switch (platform) {
      case 'youtube':
        return { name: 'YouTube', icon: Youtube, color: 'text-red-500 bg-red-500/10 border-red-500/20' };
      case 'tiktok':
        return { name: 'TikTok', icon: Film, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' };
      case 'instagram':
        return { name: 'Instagram', icon: Film, color: 'text-pink-500 bg-pink-500/10 border-pink-500/20' };
      case 'twitter':
        return { name: 'Twitter / X', icon: Film, color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' };
      case 'facebook':
        return { name: 'Facebook', icon: Film, color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' };
      default:
        return { name: 'Media Stream', icon: Video, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' };
    }
  }

  function getStageDisplay(stage: DownloadUIStage) {
    switch (stage) {
      case 'extracting':
        return { title: 'Extracting Stream Headers & Manifest...', color: 'text-purple-400', step: 1 };
      case 'downloading_video':
        return { title: 'Downloading Video Stream...', color: 'text-blue-400', step: 2 };
      case 'downloading_audio':
        return { title: 'Downloading High-Bitrate Audio Track...', color: 'text-pink-400', step: 3 };
      case 'downloading_stream':
        return { title: 'Downloading Progressive Media Stream...', color: 'text-cyan-400', step: 2 };
      case 'merging_streams':
        return { title: 'Lossless FFmpeg Stream Multiplexing...', color: 'text-amber-400', step: 4 };
      case 'converting_audio':
        return { title: 'Transcoding High-Fidelity MP3...', color: 'text-pink-400', step: 4 };
      case 'verifying':
        return { title: 'Verifying Media Stream & Container...', color: 'text-purple-400', step: 4 };
      case 'retrying':
        return { title: 'Retrying Recovery Strategy...', color: 'text-amber-400', step: 1 };
      case 'paused':
        return { title: 'Download Paused (Streams Preserved)', color: 'text-amber-400', step: 2 };
      case 'completed':
        return { title: 'Media Download & Assembly Completed!', color: 'text-emerald-400', step: 5 };
      case 'cancelled':
        return { title: 'Download Cancelled', color: 'text-rose-400', step: 0 };
      case 'error':
        return { title: 'Download Interrupted', color: 'text-rose-400', step: 0 };
      default:
        return { title: 'Ready to Download', color: 'text-slate-400', step: 0 };
    }
  }

  const stageMeta = getStageDisplay(downloadStage);
  const platformMeta = getPlatformBadge(mediaInfo?.platform);
  const PlatformIcon = platformMeta.icon;

  const videoProfiles = qualityProfiles.filter((p) => p.quality !== 'audio_only');
  const audioProfile = qualityProfiles.find((p) => p.quality === 'audio_only');

  if (!isOpen) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 z-[80] pointer-events-none flex items-center justify-center p-3 sm:p-5" 
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div 
        ref={dialogRef}
        className={`pointer-events-auto w-full max-w-3xl max-h-[90vh] rounded-2xl border shadow-2xl overflow-hidden flex flex-col transition-all duration-200 animate-in fade-in zoom-in-95 ${
          isLight 
            ? 'bg-slate-50/98 border-purple-200/90 text-slate-800 shadow-[0_20px_60px_rgba(112,26,117,0.22)] ring-1 ring-purple-500/20' 
            : 'bg-[#0B0B16]/98 border-purple-500/30 text-white shadow-[0_25px_70px_rgba(0,0,0,0.9)] ring-1 ring-purple-500/30'
        }`}
      >
        {/* Top Desktop Window Header */}
        <div 
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          className={`px-5 py-3.5 border-b flex items-center justify-between shrink-0 select-none cursor-move ${
            isLight ? 'border-purple-100 bg-white/90' : 'border-purple-500/15 bg-purple-950/30'
          }`}
        >
          <div 
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className="flex items-center gap-3 min-w-0 pointer-events-auto"
          >
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-purple-600 via-fuchsia-600 to-pink-600 text-white shadow-md shadow-pink-500/20 shrink-0">
              <PlatformIcon size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display font-bold text-sm sm:text-base tracking-tight truncate">
                  Universal Media Downloader
                </h2>
                <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border shrink-0 ${platformMeta.color}`}>
                  {platformMeta.name}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Lossless DASH video+audio merging, 4K UHD streams, and high-fidelity MP3 extraction
              </p>
            </div>
          </div>

          <div 
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className="flex items-center gap-1 shrink-0 ml-2 pointer-events-auto"
          >
            {/* Clear Media History Button */}
            <button 
              type="button"
              onClick={async () => {
                const engine = getMediaEngine();
                if (engine?.clearHistory) {
                  await engine.clearHistory().catch(console.error);
                }
                resetState('');
              }}
              className="p-1.5 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
              title="Clear Media History"
            >
              <Trash2 size={16} />
            </button>

            {/* Minimize to Floating Indicator Button */}
            <button 
              type="button"
              onClick={handleMinimize}
              className="p-1.5 rounded-xl text-slate-400 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-purple-500/10 transition-colors"
              title="Minimize to floating indicator (download continues in background)"
            >
              <Minimize2 size={16} />
            </button>

            <button 
              type="button"
              onClick={handleCloseOrMinimize}
              className="p-1.5 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
              title={isDownloading ? "Minimize window (download continues in background)" : "Close dialog"}
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Workspace */}
        <div className="p-6 space-y-5 max-h-[78vh] overflow-y-auto stable-scroll-container">
          
          {/* 1. URL Input & Extraction Control Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span>Media Stream URL</span>
              {mediaInfo && !isDownloading && (
                <button
                  type="button"
                  onClick={() => resetState('')}
                  className="text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 normal-case font-medium text-xs"
                >
                  <RotateCcw size={12} />
                  Analyze Another Link
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <input 
                  ref={inputRef}
                  type="url"
                  value={url}
                  disabled={isDownloading}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleExtract();
                  }}
                  placeholder="Paste YouTube, TikTok, Instagram, Twitter or Direct Video link..."
                  className={`w-full rounded-xl pl-3.5 pr-20 py-2.5 text-xs font-mono transition-all focus:outline-none focus:ring-2 disabled:opacity-60 ${
                    isLight 
                      ? 'bg-white border border-purple-200 text-slate-800 focus:border-purple-500 focus:ring-purple-500/20 shadow-sm' 
                      : 'bg-black/40 border border-purple-500/20 text-slate-200 focus:border-purple-500 focus:ring-purple-500/30'
                  }`}
                />
                
                <div className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1 ${isRTL ? 'left-2' : 'right-2'}`}>
                  {url && !isDownloading && (
                    <button
                      type="button"
                      onClick={() => setUrl('')}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-white"
                      title="Clear"
                    >
                      <X size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handlePasteClipboard}
                    disabled={isDownloading}
                    className="px-2 py-1 rounded-md bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-300 text-[11px] font-medium transition-colors flex items-center gap-1"
                    title="Paste from Clipboard"
                  >
                    <Clipboard size={12} />
                    Paste
                  </button>
                </div>
              </div>

              <GlassButton 
                variant="primary" 
                onClick={() => handleExtract()} 
                disabled={isExtracting || isDownloading || !url.trim()}
                className="px-5 py-2 text-xs shrink-0"
              >
                {isExtracting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    Analyze
                  </>
                )}
              </GlassButton>
            </div>
          </div>

          {/* Extraction Error Notice */}
          {extractError && (
            <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300 text-xs flex items-start gap-3 animate-in fade-in">
              <AlertCircle size={18} className="shrink-0 mt-0.5 text-rose-500" />
              <div className="space-y-1">
                <p className="font-semibold text-sm">Media Stream Analysis Notice</p>
                <p className="opacity-90 leading-relaxed">{extractError}</p>
              </div>
            </div>
          )}

          {/* Download Error Notice */}
          {downloadErrorMessage && (
            <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300 text-xs flex items-start justify-between gap-3 animate-in fade-in">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="shrink-0 mt-0.5 text-rose-500" />
                <div className="space-y-1">
                  <p className="font-semibold text-sm">Download Notice</p>
                  <p className="opacity-90 leading-relaxed">{downloadErrorMessage}</p>
                </div>
              </div>
              <GlassButton
                variant="secondary"
                onClick={handleStartRealDownload}
                className="text-xs py-1.5 px-3 shrink-0"
              >
                <RotateCcw size={12} />
                Retry
              </GlassButton>
            </div>
          )}

          {/* 2. Download Live Progress Dashboard */}
          {(isDownloading || isPaused || downloadStage === 'completed' || downloadStage === 'merging_streams' || downloadStage === 'downloading_video' || downloadStage === 'downloading_audio') && (
            <div 
              className={`p-5 rounded-2xl border space-y-4 animate-in fade-in duration-300 ${
                downloadStage === 'completed'
                  ? isLight ? 'bg-emerald-50/90 border-emerald-300 shadow-sm' : 'bg-emerald-950/20 border-emerald-500/30'
                  : isPaused
                  ? isLight ? 'bg-amber-50/90 border-amber-300 shadow-sm' : 'bg-amber-950/20 border-amber-500/30'
                  : isLight ? 'shadow-sm' : ''
              }`}
              style={
                downloadStage !== 'completed' && !isPaused
                  ? {
                      backgroundColor: 'var(--accent-subtle)',
                      borderColor: 'var(--accent-border-strong)',
                    }
                  : undefined
              }
            >
              
              {/* Header with Stage and Status Controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {downloadStage === 'completed' ? (
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                      <CheckCircle2 size={20} />
                    </div>
                  ) : isPaused ? (
                    <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center">
                      <Pause size={18} />
                    </div>
                  ) : (
                    <div 
                      className="w-8 h-8 rounded-xl flex items-center justify-center"
                      style={{
                        backgroundColor: 'var(--accent-soft)',
                        color: 'var(--accent)',
                      }}
                    >
                      <Loader2 size={18} className="animate-spin" />
                    </div>
                  )}
                  <div>
                    <p className={`text-xs font-bold ${stageMeta.color}`}>
                      {stageMeta.title}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      {mediaInfo?.title || 'Media Processing'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span 
                      className="text-base font-mono font-extrabold tracking-tight"
                      style={
                        downloadStage !== 'completed' && !isPaused
                          ? { color: 'var(--accent-text)' }
                          : undefined
                      }
                    >
                      {downloadProgress}%
                    </span>
                  </div>

                  {/* Pause / Resume / Cancel Action Buttons */}
                  {isDownloading && (
                    <button
                      type="button"
                      onClick={handlePauseDownload}
                      className="p-2 rounded-xl transition-colors hover:opacity-80"
                      style={{
                        backgroundColor: 'var(--accent-soft)',
                        color: 'var(--accent-text)',
                      }}
                      title="Pause Download"
                    >
                      <Pause size={16} />
                    </button>
                  )}

                  {isPaused && (
                    <button
                      type="button"
                      onClick={handleResumeDownload}
                      className="p-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-600 dark:text-emerald-400 transition-colors"
                      title="Resume Download"
                    >
                      <Play size={16} />
                    </button>
                  )}

                  {(isDownloading || isPaused) && (
                    <button
                      type="button"
                      onClick={handleCancelActiveDownload}
                      className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 transition-colors"
                      title="Cancel Download"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Multi-step progress track */}
              <div className="space-y-1.5">
                <div className="w-full h-2.5 rounded-full bg-black/20 dark:bg-white/10 overflow-hidden relative shadow-inner">
                  <div 
                    className="h-full transition-all duration-300 rounded-full"
                    style={{ 
                      width: `${Math.max(2, downloadProgress)}%`,
                      background: downloadStage === 'completed'
                        ? '#10B981'
                        : isPaused
                        ? '#F59E0B'
                        : 'linear-gradient(90deg, var(--accent-gradient-start), var(--accent-gradient-end))'
                    }}
                  />
                </div>

                {/* Sub-step indicator pills */}
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1">
                  <span style={downloadProgress >= 5 ? { color: 'var(--accent)', fontWeight: 'bold' } : undefined}>1. Metadata</span>
                  <span>•</span>
                  <span style={downloadProgress >= 30 ? { color: 'var(--accent)', fontWeight: 'bold' } : undefined}>2. Video Stream</span>
                  <span>•</span>
                  <span style={downloadProgress >= 70 ? { color: 'var(--accent)', fontWeight: 'bold' } : undefined}>3. Audio Track</span>
                  <span>•</span>
                  <span style={downloadProgress >= 88 ? { color: '#F59E0B', fontWeight: 'bold' } : undefined}>4. FFmpeg Merge</span>
                  <span>•</span>
                  <span style={downloadProgress >= 100 ? { color: '#10B981', fontWeight: 'bold' } : undefined}>5. Ready</span>
                </div>
              </div>

              {/* Metrics Footer */}
              <div 
                className="flex flex-wrap items-center justify-between text-xs font-mono text-slate-500 dark:text-slate-400 pt-1 border-t"
                style={{ borderColor: 'var(--accent-border)' }}
              >
                <div className="flex items-center gap-4">
                  {downloadSpeed && (
                    <span>Speed: <strong style={{ color: 'var(--accent-text)' }} className="font-bold">{downloadSpeed}</strong></span>
                  )}
                  {downloadEta && (
                    <span>ETA: <strong>{downloadEta}</strong></span>
                  )}
                  {downloadedBytes && totalBytes && (
                    <span>
                      {formatBytes(downloadedBytes)} / {formatBytes(totalBytes)}
                    </span>
                  )}
                </div>

                {completedFilePath && (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleOpenFile}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center gap-1.5 font-semibold text-xs"
                    >
                      <FileCheck2 size={13} />
                      Open File
                    </button>
                    <button 
                      onClick={handleOpenFolder}
                      className="px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1.5 font-semibold text-xs"
                      style={{
                        backgroundColor: 'var(--accent-soft)',
                        color: 'var(--accent-text)',
                      }}
                    >
                      <Folder size={13} />
                      Open Folder
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. Media Metadata Card */}
          {mediaInfo && (
            <div className="space-y-5 animate-in fade-in duration-300">
              
              <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row gap-4 ${
                isLight ? 'bg-white border-purple-100 shadow-sm' : 'bg-white/[0.02] border-white/10'
              }`}>
                {mediaInfo.thumbnail && (
                  <div className="w-full sm:w-48 h-28 rounded-xl overflow-hidden shrink-0 bg-black/40 relative shadow-md group flex items-center justify-center">
                    <img 
                      src={mediaInfo.thumbnail} 
                      alt={mediaInfo.title}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                      }}
                    />
                    {mediaInfo.formattedDuration && (
                      <span className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-md bg-black/85 backdrop-blur-sm text-[11px] font-mono font-bold text-white shadow">
                        {mediaInfo.formattedDuration}
                      </span>
                    )}
                    <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-purple-900/80 backdrop-blur-sm text-[10px] font-mono font-bold text-purple-200 shadow uppercase">
                      {mediaInfo.platform}
                    </span>
                  </div>
                )}

                <div className="flex-1 min-w-0 space-y-2 flex flex-col justify-center">
                  <h3 className="font-bold text-sm sm:text-base leading-snug line-clamp-2">
                    {mediaInfo.title}
                  </h3>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    {mediaInfo.uploader && (
                      <span className="flex items-center gap-1.5 font-medium">
                        <User size={14} className="text-purple-500" />
                        {mediaInfo.uploader}
                      </span>
                    )}
                    {mediaInfo.formattedDuration && (
                      <span className="flex items-center gap-1.5 font-mono">
                        <Clock size={14} className="text-pink-500" />
                        {mediaInfo.formattedDuration}
                      </span>
                    )}
                    {mediaInfo.cleanFileName && (
                      <span className="flex items-center gap-1 font-mono text-[11px] opacity-70 truncate max-w-[200px]">
                        {mediaInfo.cleanFileName}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 4. Stream Quality & Container Selector */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  {/* Segmented Mode Switcher (Video vs Audio Only) */}
                  <div 
                    className="p-1 rounded-xl border flex items-center gap-1"
                    style={{
                      backgroundColor: isLight ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.4)',
                      borderColor: 'var(--accent-border)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('video');
                        setSelectedContainer('mp4');
                        if (videoProfiles.length > 0) {
                          setSelectedQuality(videoProfiles[0].quality);
                        }
                      }}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        activeTab === 'video'
                          ? 'text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                      }`}
                      style={
                        activeTab === 'video'
                          ? {
                              background: 'linear-gradient(135deg, var(--accent-gradient-start), var(--accent-gradient-end))',
                              color: 'var(--accent-contrast)',
                            }
                          : undefined
                      }
                    >
                      <Video size={14} />
                      Video Streams
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
                        {videoProfiles.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('audio');
                        setSelectedQuality('audio_only');
                        setSelectedContainer('mp3');
                      }}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        activeTab === 'audio'
                          ? 'text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                      }`}
                      style={
                        activeTab === 'audio'
                          ? {
                              background: 'linear-gradient(135deg, var(--accent-gradient-start), var(--accent-gradient-end))',
                              color: 'var(--accent-contrast)',
                            }
                          : undefined
                      }
                    >
                      <Music size={14} />
                      Audio Only (MP3)
                    </button>
                  </div>

                  {/* Target Container Pills */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400 font-medium mr-1">Container:</span>
                    {activeTab === 'video' ? (
                      (['mp4', 'mkv', 'webm'] as const).map((cnt) => (
                        <button
                          key={cnt}
                          type="button"
                          disabled={isDownloading}
                          onClick={() => setSelectedContainer(cnt)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono uppercase transition-all ${
                            selectedContainer === cnt
                              ? 'text-white font-bold shadow-sm'
                              : isLight
                              ? 'bg-white border border-slate-200 text-slate-600 hover:opacity-90'
                              : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10'
                          }`}
                          style={
                            selectedContainer === cnt
                              ? {
                                  backgroundColor: 'var(--accent)',
                                  color: 'var(--accent-contrast)',
                                }
                              : undefined
                          }
                        >
                          .{cnt}
                        </button>
                      ))
                    ) : (
                      (['mp3', 'm4a'] as const).map((cnt) => (
                        <button
                          key={cnt}
                          type="button"
                          disabled={isDownloading}
                          onClick={() => setSelectedContainer(cnt)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono uppercase transition-all ${
                            selectedContainer === cnt
                              ? 'text-white font-bold shadow-sm'
                              : isLight
                              ? 'bg-white border border-slate-200 text-slate-600 hover:opacity-90'
                              : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10'
                          }`}
                          style={
                            selectedContainer === cnt
                              ? {
                                  backgroundColor: 'var(--accent)',
                                  color: 'var(--accent-contrast)',
                                }
                              : undefined
                          }
                        >
                          .{cnt}
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Quality Grid for Video Mode */}
                {activeTab === 'video' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {videoProfiles.map((p) => {
                      const isSelected = selectedQuality === p.quality;
                      const is4K = p.quality === '2160p';
                      const is2K = p.quality === '1440p';
                      const isFHD = p.quality === '1080p';

                      return (
                        <button
                          key={p.quality}
                          type="button"
                          disabled={isDownloading}
                          onClick={() => setSelectedQuality(p.quality)}
                          className={`p-3.5 rounded-xl border text-left flex items-center justify-between transition-all disabled:opacity-50 ${
                            isSelected
                              ? isLight
                                ? 'shadow-md'
                                : ''
                              : isLight
                                ? 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                                : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/10 text-slate-300'
                          }`}
                          style={
                            isSelected
                              ? {
                                  backgroundColor: 'var(--accent-soft)',
                                  borderColor: 'var(--accent)',
                                  boxShadow: isLight ? 'var(--accent-glow-sm)' : 'var(--accent-glow)',
                                }
                              : undefined
                          }
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`px-2.5 py-1 rounded-lg font-mono font-bold text-xs shrink-0 flex items-center justify-center ${
                              is4K
                                ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                                : is2K
                                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                : isFHD
                                ? 'border'
                                : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                            }`}
                            style={
                              isFHD
                                ? {
                                    backgroundColor: 'var(--accent-soft)',
                                    color: 'var(--accent-text)',
                                    borderColor: 'var(--accent-border-strong)',
                                  }
                                : undefined
                            }>
                              {p.quality.toUpperCase()}
                            </div>

                            <div className="min-w-0 space-y-0.5">
                              <div className="text-xs font-bold truncate flex items-center gap-1.5">
                                {p.label}
                                {p.isDash && (
                                  <span 
                                    className="text-[9px] font-mono px-1.5 py-0.2 rounded border" 
                                    style={{
                                      backgroundColor: 'var(--accent-subtle)',
                                      color: 'var(--accent-text)',
                                      borderColor: 'var(--accent-border)',
                                    }}
                                    title="Separate high-res video and audio tracks losslessly merged with FFmpeg"
                                  >
                                    DASH MUX
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                <strong>{formatBytes(p.estimatedTotalSize)}</strong> • {selectedContainer.toUpperCase()}
                              </div>
                            </div>
                          </div>

                          {isSelected && (
                            <div 
                              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 shadow"
                              style={{
                                background: 'linear-gradient(135deg, var(--accent-gradient-start), var(--accent-gradient-end))',
                                color: 'var(--accent-contrast)',
                              }}
                            >
                              <Check size={14} strokeWidth={3} />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Quality Card for Audio Mode */}
                {activeTab === 'audio' && (
                  <div className={`p-4 rounded-xl border space-y-2 ${
                    isLight ? 'bg-pink-50/60 border-pink-200' : 'bg-pink-950/20 border-pink-500/30'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-3 rounded-xl bg-pink-500/20 text-pink-500">
                          <Music size={24} />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm">
                            High-Fidelity Audio Extractor (320 kbps MP3)
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Extracts highest available audio stream and losslessly encodes with libmp3lame
                          </p>
                        </div>
                      </div>

                      <div className="text-right font-mono text-xs">
                        <span className="font-bold text-pink-600 dark:text-pink-400">
                          ~{formatBytes(audioProfile?.estimatedTotalSize || (mediaInfo?.duration ? mediaInfo.duration * 40000 : 8500000))}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 5. Destination Save Folder Selector */}
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Folder size={13} className="text-purple-500" />
                  Save Location
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className={`flex-1 rounded-xl px-3.5 py-2 text-xs font-mono truncate border flex items-center gap-2 ${
                    isLight ? 'bg-white border-slate-200 text-slate-700 shadow-sm' : 'bg-black/40 border-white/10 text-slate-300'
                  }`}>
                    <HardDrive size={14} className="text-purple-500 shrink-0" />
                    <span className="truncate">{saveFolder}</span>
                  </div>
                  <GlassButton 
                    variant="secondary" 
                    onClick={handleSelectFolder} 
                    disabled={isDownloading}
                    className="text-xs py-2 px-3 shrink-0"
                  >
                    Browse...
                  </GlassButton>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Action Footer */}
        <div className={`px-6 py-4 border-t flex flex-wrap items-center justify-between gap-3 ${
          isLight ? 'border-purple-100 bg-white/90' : 'border-purple-500/15 bg-[#070712]'
        }`}>
          {isDownloading || isPaused ? (
            <div className="flex items-center gap-2">
              <button 
                type="button" 
                onClick={handleCancelActiveDownload}
                className="text-xs font-medium text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-rose-500/10"
              >
                <X size={14} />
                Stop & Cancel
              </button>
            </div>
          ) : (
            <button 
              type="button" 
              onClick={handleCloseOrMinimize}
              className="text-xs font-medium text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
            >
              {downloadStage === 'completed' ? 'Close Window' : 'Cancel'}
            </button>
          )}

          <div className="flex items-center gap-2.5">
            {downloadStage === 'completed' ? (
              <>
                <GlassButton
                  variant="secondary"
                  onClick={() => resetState('')}
                  className="text-xs py-2 px-3"
                >
                  <RotateCcw size={13} />
                  Download Another Video
                </GlassButton>

                <GlassButton
                  variant="secondary"
                  onClick={handleOpenFile}
                  className="text-xs py-2 px-3.5"
                >
                  <FileCheck2 size={14} />
                  Open File
                </GlassButton>

                <GlassButton
                  variant="primary"
                  onClick={handleOpenFolder}
                  className="text-xs py-2 px-4"
                >
                  <Folder size={14} />
                  Open Folder
                </GlassButton>
              </>
            ) : !isDownloading && !isPaused ? (
              <GlassButton
                variant="primary"
                onClick={handleStartRealDownload}
                disabled={!mediaInfo || isExtracting}
                className="text-xs py-2.5 px-6 font-bold"
              >
                <Download size={15} />
                {activeTab === 'audio' ? 'Download Audio Track' : `Download ${selectedQuality.toUpperCase()} Video`}
              </GlassButton>
            ) : null}
          </div>
        </div>

      </div>
    </div>
  );
}
