import { useState, useEffect, useRef, useCallback } from "react";
import { SetupData } from "./SetupPage";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Play, Pause, Download, Video, RotateCcw, CheckCircle, Pencil, X, Check, Upload, Plus, Image as ImageIcon, Type, Layers } from "lucide-react";

export interface OverlayMarker {
  id: string;
  startTime: number;
  duration: number;
  text: string;
  imageDataUrl: string;
}

interface DisplayPageProps {
  data: SetupData;
  onBack: () => void;
}

type Phase = "timing" | "playback";

function drawCanvasFrame(
  canvas: HTMLCanvasElement | null,
  activeIdx: number,
  ds: {
    groupLines: string[]; groupWords: string[]; groupStart: number;
    slokaFontSize: number; previousFontSize: number; highlightColor: string;
    slokaBold: boolean; slokaItalic: boolean;
    overlays: OverlayMarker[]; localItems: string[];
  },
  currentTime: number
) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const activeOv = ds.overlays.filter(
    (o) => currentTime >= o.startTime && currentTime < o.startTime + o.duration
  ).pop();

  if (activeOv) {
    const fontSize = Math.max(28, Math.min(64, W * 0.045));
    ctx.font = `bold ${fontSize}px 'Mandali','Noto Sans Telugu',Georgia,serif`;
    ctx.fillStyle = "#1a1a1a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const words = activeOv.text.split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width > W * 0.94 && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    const lh = fontSize * 1.35;
    const startY = H / 2 - ((lines.length - 1) * lh) / 2;
    lines.forEach((ln, i) => ctx.fillText(ln, W / 2, startY + i * lh));
    return;
  }

  const SF = Math.max(16, Math.min(ds.slokaFontSize, 42));
  const fontStyle = ds.slokaItalic ? "italic " : "";
  const fontWeight = ds.slokaBold ? "bold " : "";
  ctx.font = `${fontStyle}${fontWeight}${SF}px 'Mandali','Noto Sans Telugu',Georgia,serif`;
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const slokaLineH = SF * 1.5;
  let slokaBottom = 36;
  ds.groupLines.forEach((line, i) => {
    ctx.fillText(line, W / 2, slokaBottom + i * slokaLineH);
  });
  slokaBottom += ds.groupLines.length * slokaLineH + 16;

  const divY = slokaBottom;
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, "rgba(255,215,0,0)");
  grad.addColorStop(0.05, "rgba(255,215,0,0.15)");
  grad.addColorStop(0.35, "rgba(255,215,0,1)");
  grad.addColorStop(0.5, "rgba(255,255,180,1)");
  grad.addColorStop(0.65, "rgba(255,215,0,1)");
  grad.addColorStop(0.95, "rgba(255,215,0,0.15)");
  grad.addColorStop(1, "rgba(255,215,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, divY, W, 3);

  const WF = Math.max(14, Math.min(ds.previousFontSize, 38));
  const ROWS = 3;
  const startX = W * 0.1;
  const rowGap = Math.max(WF * 2.4, 56);
  const wordsY = divY + 48;

  ctx.font = `bold ${WF * 1.3}px 'Mandali','Noto Sans Telugu',Georgia,serif`;
  let maxW = 60;
  ds.groupWords.forEach((_, i) => {
    const item = ds.localItems[ds.groupStart + i];
    if (item) maxW = Math.max(maxW, ctx.measureText(item).width);
  });
  const colGap = maxW + 64;

  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ds.groupWords.forEach((_, i) => {
    const globalIdx = ds.groupStart + i;
    const item = ds.localItems[globalIdx];
    if (!item) return;
    const numWordsInCanvas = ds.localItems.length;
    const activeWordIdx = numWordsInCanvas > 0 && activeIdx >= 0 ? activeIdx % numWordsInCanvas : activeIdx;
    const isActive = globalIdx === activeWordIdx;
    const isPast = activeWordIdx >= 0 && globalIdx < activeWordIdx;
    if (!isActive && !isPast) return;
    const col = Math.floor(i / ROWS);
    const row = i % ROWS;
    const x = startX + col * colGap;
    const y = wordsY + row * rowGap;
    if (isActive) {
      ctx.font = `bold ${WF * 1.3}px 'Mandali','Noto Sans Telugu',Georgia,serif`;
      ctx.fillStyle = ds.highlightColor;
      const arrowW = ctx.measureText("▶ ").width;
      ctx.fillText("▶ ", x, y);
      ctx.fillText(item, x + arrowW, y);
    } else {
      ctx.font = `${WF}px 'Mandali','Noto Sans Telugu',Georgia,serif`;
      ctx.fillStyle = "#000000";
      ctx.fillText(item, x, y);
    }
  });
}

export default function DisplayPage({ data, onBack }: DisplayPageProps) {
  const { groups: rawGroups, audioFile, highlightColor, highlightedFontSize, previousFontSize, slokaFontSize, slokaBold, slokaItalic } = data;
  const groups = rawGroups ?? [];

  const flatItems = groups.flatMap((g) => g.words);
  const groupStartIndices: number[] = groups.reduce<number[]>((acc, g, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + groups[i - 1].words.length);
    return acc;
  }, []);

  const [phase, setPhase] = useState<Phase>("timing");
  const [localItems, setLocalItems] = useState<string[]>([...flatItems]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [timestamps, setTimestamps] = useState<number[]>([]);
  const [timingIndex, setTimingIndex] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [displayGroup, setDisplayGroup] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const wordListRef = useRef<HTMLDivElement>(null);
  const activeWordRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const timestampsRef = useRef<number[]>([]);
  const timingIndexRef = useRef(0);
  const [playbackOffset, setPlaybackOffset] = useState(0.15);
  const playbackOffsetRef = useRef(0.15);
  const autoDownloadRef = useRef(false);
  const phaseRef = useRef<Phase>("timing");
  const localItemsLenRef = useRef(flatItems.length);
  const audioEndedInTimingRef = useRef(false);
  const lastActiveRef = useRef(-1);
  const lastAudioTimeUpdateRef = useRef(0);
  const goToPlaybackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markersFileInputRef = useRef<HTMLInputElement>(null);
  const overlayImageInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isRecordingRef = useRef(false);
  const displayStateRef = useRef({
    groupLines: [] as string[],
    groupWords: [] as string[],
    groupStart: 0,
    slokaFontSize: 32,
    previousFontSize: 28,
    highlightColor: "#f59e0b",
    slokaBold: false,
    slokaItalic: false,
    overlays: [] as OverlayMarker[],
    localItems: [] as string[],
  });

  const [overlays, setOverlays] = useState<OverlayMarker[]>([]);
  const [addingOverlay, setAddingOverlay] = useState(false);
  const [pendingOverlayTime, setPendingOverlayTime] = useState(0);
  const [newOverlayText, setNewOverlayText] = useState("");
  const [newOverlayDuration, setNewOverlayDuration] = useState(3);
  const [newOverlayImageDataUrl, setNewOverlayImageDataUrl] = useState("");
  const [newOverlayImageName, setNewOverlayImageName] = useState("");

  const getTimingDisplayGroup = (idx: number) => {
    let g = 0;
    for (let i = groupStartIndices.length - 1; i >= 0; i--) {
      if (idx >= groupStartIndices[i]) { g = i; break; }
    }
    return g;
  };

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { localItemsLenRef.current = localItems.length; }, [localItems.length]);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  // NOTE: timestampsRef is kept in sync manually inside each function that updates it.
  // Do NOT add a useEffect to sync state→ref here — that causes stale overwrites because
  // React processes old setTimestamps calls after newer direct ref writes.
  useEffect(() => {
    displayStateRef.current = {
      groupLines: groups[displayGroup]?.lines ?? [],
      groupWords: groups[displayGroup]?.words ?? [],
      groupStart: groupStartIndices[displayGroup] ?? 0,
      slokaFontSize,
      previousFontSize,
      highlightColor,
      slokaBold,
      slokaItalic,
      overlays,
      localItems,
    };
  });

  useEffect(() => {
    if (!isRecording) return;
    const handler = () => {
      if (document.visibilityState === "hidden") stopAndSaveRecording();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [isRecording]);

  useEffect(() => {
    if (groups.length === 0) onBack();
  }, []);

  useEffect(() => {
    if (!audioFile) return;
    const url = URL.createObjectURL(audioFile);
    const audio = new Audio(url);
    audio.addEventListener("loadedmetadata", () => setAudioDuration(audio.duration));
    audio.addEventListener("ended", () => {
      setIsPlaying(false);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (phaseRef.current === "timing") {
        const next = [...timestampsRef.current];
        const startIdx = timingIndexRef.current;
        const nw = localItemsLenRef.current;
        // Don't fill unmarked positions — partial cycles are allowed.
        // Just advance timingIndex to the cycle boundary so the next cycle can start.
        const cycleEnd = nw > 0 ? (Math.floor(startIdx / nw) + 1) * nw : startIdx;
        timestampsRef.current = next;
        timingIndexRef.current = cycleEnd;
        setTimestamps([...next]);
        setTimingIndex(cycleEnd);
        audioEndedInTimingRef.current = true;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        autoDownloadRef.current = true;
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      }
    });
    audioRef.current = audio;
    return () => {
      audio.pause();
      URL.revokeObjectURL(url);
    };
  }, [audioFile]);

  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const t = audio.currentTime;

    const now = performance.now();
    if (now - lastAudioTimeUpdateRef.current >= 100) {
      lastAudioTimeUpdateRef.current = now;
      setAudioCurrentTime(t);
    }

    let active = -1;
    const ts = timestampsRef.current;
    if (ts.length > 0) {
      const ahead = t + playbackOffsetRef.current;
      for (let i = ts.length - 1; i >= 0; i--) {
        if (ts[i] != null && ahead >= ts[i]) { active = i; break; }
      }
    }
    if (active !== lastActiveRef.current) {
      lastActiveRef.current = active;
      setCurrentIndex(active);
    }
    if (isRecordingRef.current) {
      drawCanvasFrame(canvasRef.current, lastActiveRef.current, displayStateRef.current, audioRef.current?.currentTime ?? 0);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (activeWordRef.current) {
      activeWordRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [timingIndex]);

  useEffect(() => {
    // Auto-navigate to preview only after the first cycle AND all words were marked.
    // Partial cycles or multi-cycle use: user clicks Done manually.
    if (audioEndedInTimingRef.current && timingIndex === localItems.length) {
      const ts = timestampsRef.current;
      const allMarked = localItems.length > 0 &&
        ts.slice(0, localItems.length).every(t => t !== undefined && t !== null);
      if (allMarked) {
        audioEndedInTimingRef.current = false;
        if (goToPlaybackTimerRef.current) clearTimeout(goToPlaybackTimerRef.current);
        goToPlaybackTimerRef.current = setTimeout(() => {
          goToPlaybackTimerRef.current = null;
          goToPlayback();
        }, 600);
      } else {
        audioEndedInTimingRef.current = false;
      }
    }
  }, [timingIndex]);

  useEffect(() => {
    if (recordedBlob && autoDownloadRef.current) {
      autoDownloadRef.current = false;
      const ext = recordedBlob.type.includes("mp4") ? "mp4" : "webm";
      const url = URL.createObjectURL(recordedBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sloka-display.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [recordedBlob]);

  useEffect(() => {
    if (currentIndex < 0) return;
    const wordIdx = localItems.length > 0 ? currentIndex % localItems.length : currentIndex;
    let g = 0;
    for (let i = groupStartIndices.length - 1; i >= 0; i--) {
      if (wordIdx >= groupStartIndices[i]) { g = i; break; }
    }
    setDisplayGroup(g);
  }, [currentIndex]);

  const toggleAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    } else {
      lastActiveRef.current = -1;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          setIsPlaying(false);
          if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        });
      }
      setIsPlaying(true);
      rafRef.current = requestAnimationFrame(tick);
    }
  };

  const startEdit = (i: number) => {
    setEditingIndex(i);
    setEditValue(localItems[i]);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const confirmEdit = () => {
    if (editingIndex === null) return;
    const trimmed = editValue.trim();
    if (trimmed) {
      setLocalItems((prev) => {
        const next = [...prev];
        next[editingIndex] = trimmed;
        return next;
      });
    }
    setEditingIndex(null);
    setEditValue("");
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditValue("");
  };

  const handleEnterTiming = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !isPlaying) return;
    const numWords = localItems.length;
    if (numWords === 0) return;
    let idx = timingIndexRef.current;
    const t = Math.max(0, audio.currentTime - 1);
    const next = [...timestampsRef.current];
    next[idx] = t;
    // Advance past already-marked positions but stay within the current cycle
    const cycleEnd = (Math.floor(idx / numWords) + 1) * numWords;
    let nextIdx = idx + 1;
    while (nextIdx < cycleEnd && next[nextIdx] !== undefined && (next[nextIdx] as unknown) !== null) {
      nextIdx++;
    }
    timestampsRef.current = next;
    timingIndexRef.current = nextIdx;
    setTimestamps(next);
    setTimingIndex(nextIdx);
  }, [isPlaying, localItems.length]);

  useEffect(() => {
    if (phase !== "timing") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        if (editingIndex !== null) { confirmEdit(); return; }
        e.preventDefault();
        handleEnterTiming();
      }
      if (e.key === "Escape" && editingIndex !== null) cancelEdit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, handleEnterTiming, editingIndex, editValue]);

  const goToPlayback = () => {
    if (goToPlaybackTimerRef.current) {
      clearTimeout(goToPlaybackTimerRef.current);
      goToPlaybackTimerRef.current = null;
    }
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.currentTime = 0; }
    setIsPlaying(false);
    lastActiveRef.current = -1;
    setCurrentIndex(-1);
    setAudioCurrentTime(0);
    setDisplayGroup(0);
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setPhase("playback");
  };

  const resetPreview = () => {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.currentTime = 0; }
    setIsPlaying(false);
    lastActiveRef.current = -1;
    setCurrentIndex(-1);
    setAudioCurrentTime(0);
    setDisplayGroup(0);
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  };

  const handlePlaybackSeek = (t: number) => {
    if (audioRef.current) audioRef.current.currentTime = t;
    setAudioCurrentTime(t);
    const ts = timestampsRef.current;
    const ahead = t + playbackOffsetRef.current;
    let active = -1;
    for (let i = ts.length - 1; i >= 0; i--) {
      if (ts[i] != null && ahead >= ts[i]) { active = i; break; }
    }
    lastActiveRef.current = active;
    setCurrentIndex(active);
    if (active >= 0) {
      const wordIdx = localItems.length > 0 ? active % localItems.length : active;
      let g = 0;
      for (let i = groupStartIndices.length - 1; i >= 0; i--) {
        if (wordIdx >= groupStartIndices[i]) { g = i; break; }
      }
      setDisplayGroup(g);
    } else {
      setDisplayGroup(0);
    }
  };

  const [retimeMenuGroup, setRetimeMenuGroup] = useState<number | null>(null);

  const finishCycle = () => {
    const nw = localItemsLenRef.current;
    const curTi = timingIndexRef.current;
    if (nw === 0) return;
    const cycleIndex = curTi === 0 ? 0 : Math.floor((curTi - 1) / nw);
    const cycleEnd = (cycleIndex + 1) * nw;
    timingIndexRef.current = cycleEnd;
    audioEndedInTimingRef.current = false;
    setTimingIndex(cycleEnd);
  };

  const markGroupStart = (groupIdx: number) => {
    const nw = localItemsLenRef.current;
    const curTi = timingIndexRef.current;
    // Determine which cycle the user is currently in
    const cycleIndex = nw === 0 ? 0 : (curTi === 0 ? 0 : Math.floor((curTi - 1) / nw));
    const cycleOffset = cycleIndex * nw;
    const startIdx = cycleOffset + groupStartIndices[groupIdx];
    const groupEndIdx = cycleOffset + (groupIdx + 1 < groupStartIndices.length
      ? groupStartIndices[groupIdx + 1]
      : nw);
    const existing = [...timestampsRef.current];
    while (existing.length < groupEndIdx) existing.push(undefined as unknown as number);
    for (let i = startIdx; i < groupEndIdx; i++) {
      existing[i] = undefined as unknown as number;
    }
    timestampsRef.current = existing;
    timingIndexRef.current = startIdx;
    audioEndedInTimingRef.current = false;
    setTimestamps([...existing]);
    setTimingIndex(startIdx);
    setRetimeMenuGroup(null);
  };

  const retimeFromGroup = (groupIdx: number, resetAudio: boolean) => {
    const nw = localItemsLenRef.current;
    const curTi = timingIndexRef.current;
    const cycleIndex = nw === 0 ? 0 : (curTi === 0 ? 0 : Math.floor((curTi - 1) / nw));
    const cycleOffset = cycleIndex * nw;
    const startIdx = cycleOffset + groupStartIndices[groupIdx];
    const groupEndIdx = cycleOffset + (groupIdx + 1 < groupStartIndices.length
      ? groupStartIndices[groupIdx + 1]
      : nw);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      if (resetAudio) audio.currentTime = 0;
    }
    setIsPlaying(false);
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    audioEndedInTimingRef.current = false;
    // Preserve timestamps outside this group; clear only within it
    const existing = [...timestampsRef.current];
    while (existing.length < groupEndIdx) existing.push(undefined as unknown as number);
    for (let i = startIdx; i < groupEndIdx; i++) {
      existing[i] = undefined as unknown as number;
    }
    timestampsRef.current = existing;
    timingIndexRef.current = startIdx;
    setTimestamps([...existing]);
    setTimingIndex(startIdx);
    if (resetAudio) setAudioCurrentTime(0);
    setCurrentIndex(-1);
    setRetimeMenuGroup(null);
  };

  const goBackToTiming = () => {
    if (goToPlaybackTimerRef.current) { clearTimeout(goToPlaybackTimerRef.current); goToPlaybackTimerRef.current = null; }
    const audio = audioRef.current;
    if (audio) { audio.pause(); }
    setIsPlaying(false);
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setPhase("timing");
  };

  const restartTiming = () => {
    if (goToPlaybackTimerRef.current) { clearTimeout(goToPlaybackTimerRef.current); goToPlaybackTimerRef.current = null; }
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.currentTime = 0; }
    setIsPlaying(false);
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    lastActiveRef.current = -1;
    timestampsRef.current = [];
    timingIndexRef.current = 0;
    setTimestamps([]);
    setTimingIndex(0);
    setAudioCurrentTime(0);
    setCurrentIndex(-1);
    setDisplayGroup(0);
    setPhase("timing");
  };

  const startPlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    lastActiveRef.current = -1;
    setCurrentIndex(-1);
    setDisplayGroup(0);
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        setIsPlaying(false);
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      });
    }
    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  };

  const stopAndSaveRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    autoDownloadRef.current = true;
    recorder.stop();
    const audio = audioRef.current;
    if (audio) { audio.pause(); }
    setIsPlaying(false);
    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  const startRecording = async () => {
    try {
      const canvas = canvasRef.current;
      if (!canvas) { alert("Canvas not ready. Please try again."); return; }

      const videoStream = canvas.captureStream(30);
      const audioEl = audioRef.current as any;
      const audioStream: MediaStream | null =
        typeof audioEl?.captureStream === "function" ? audioEl.captureStream() : null;

      const combinedTracks = [
        ...videoStream.getVideoTracks(),
        ...(audioStream ? audioStream.getAudioTracks() : []),
      ];
      const combinedStream = new MediaStream(combinedTracks);
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "video/mp4";

      const recorder = new MediaRecorder(combinedStream, { mimeType });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      };

      const audio = audioRef.current;
      if (audio) { audio.pause(); audio.currentTime = 0; }
      lastActiveRef.current = -1;
      setCurrentIndex(-1);
      setDisplayGroup(0);
      setAudioCurrentTime(0);
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

      mediaRecorderRef.current = recorder;
      recorder.start(100);
      isRecordingRef.current = true;
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = window.setInterval(() => setRecordingTime((t) => t + 1), 1000);

      drawCanvasFrame(canvas, -1, displayStateRef.current, 0);
      setTimeout(() => startPlayback(), 500);
    } catch (err) {
      alert("Recording failed: " + err);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    const audio = audioRef.current;
    if (audio) { audio.pause(); }
    setIsPlaying(false);
    setIsRecording(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };

  const downloadRecording = () => {
    if (!recordedBlob) return;
    const ext = recordedBlob.type.includes("mp4") ? "mp4" : "webm";
    const url = URL.createObjectURL(recordedBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sloka-display.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openAddOverlay = () => {
    setPendingOverlayTime(audioRef.current?.currentTime ?? 0);
    setNewOverlayText("");
    setNewOverlayDuration(3);
    setNewOverlayImageDataUrl("");
    setNewOverlayImageName("");
    setAddingOverlay(true);
  };

  const saveOverlay = () => {
    if (!newOverlayText.trim() && !newOverlayImageDataUrl) return;
    const marker: OverlayMarker = {
      id: `ov-${Date.now()}`,
      startTime: pendingOverlayTime,
      duration: newOverlayDuration,
      text: newOverlayText.trim(),
      imageDataUrl: newOverlayImageDataUrl,
    };
    setOverlays((prev) => [...prev, marker].sort((a, b) => a.startTime - b.startTime));
    setAddingOverlay(false);
  };

  const deleteOverlay = (id: string) => setOverlays((prev) => prev.filter((o) => o.id !== id));

  const handleOverlayImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewOverlayImageName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setNewOverlayImageDataUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const downloadMarkers = () => {
    const payload = {
      words: localItems,
      timestamps,
      overlays,
      audioDuration: audioRef.current?.duration ?? null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sloka-markers.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const uploadMarkers = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        if (!Array.isArray(json.timestamps)) throw new Error("Invalid format");
        const loaded: number[] = json.timestamps;
        const firstUnmarked = loaded.findIndex((t) => t === null || t === undefined);
        const timingIdx = firstUnmarked === -1 ? loaded.length : firstUnmarked;
        timestampsRef.current = loaded;
        timingIndexRef.current = timingIdx;
        setTimestamps(loaded);
        setTimingIndex(timingIdx);
        if (json.words && Array.isArray(json.words)) {
          setLocalItems(json.words);
          localItemsLenRef.current = json.words.length;
        }
        if (json.overlays && Array.isArray(json.overlays)) {
          setOverlays(json.overlays);
        }
        const audioDur = audioRef.current?.duration ?? 0;
        const savedDur: number | null = json.audioDuration ?? null;
        if (loaded.length > 0) {
          const maxTs = Math.max(...loaded);
          if (audioDur > 0 && maxTs > audioDur) {
            alert(
              `Warning: This markers file has timestamps up to ${(maxTs / 60).toFixed(1)} min, ` +
              `but the loaded audio is only ${(audioDur / 60).toFixed(1)} min long.\n\n` +
              `These markers were saved with a different audio file. ` +
              `The ${loaded.filter((t) => t > audioDur).length} affected word(s) will not highlight during playback — please re-mark them.`
            );
          } else if (audioDur === 0 && savedDur !== null) {
            alert(
              `Note: This markers file was saved with a ${(savedDur / 60).toFixed(1)} min audio file. ` +
              `Make sure you load the same audio before playback, otherwise timestamps may not match.`
            );
          }
        }
      } catch {
        alert("Could not read markers file. Make sure it is a valid sloka-markers.json.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toFixed(1).padStart(4, "0");
    return `${m}:${sec}`;
  };

  const progress = audioDuration > 0 ? (audioCurrentTime / audioDuration) * 100 : 0;

  if (phase === "timing") {
    const numWords = localItems.length;
    // Cycle-relative index: which word within the current cycle are we on?
    const currentCycleIndex = numWords === 0 ? 0 : (timingIndex === 0 ? 0 : Math.floor((timingIndex - 1) / numWords));
    const currentCycleOffset = currentCycleIndex * numWords;
    const cycleTimingIndex = timingIndex - currentCycleOffset; // 0..numWords
    const numCycles = currentCycleIndex + 1;
    const cycleComplete = cycleTimingIndex === numWords && numWords > 0;

    const timingGroup = getTimingDisplayGroup(Math.min(cycleTimingIndex, numWords - 1));
    const timingGroupLines = groups[timingGroup]?.lines ?? [];
    const currentGroupEndIdx = timingGroup + 1 < groups.length
      ? groupStartIndices[timingGroup + 1]
      : numWords;
    const isRemarkMode = !cycleComplete && cycleTimingIndex < numWords &&
      timestamps.some((t, i) => i >= currentCycleOffset + currentGroupEndIdx && i < currentCycleOffset + numWords && t != null);

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col text-gray-900">
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack} className="text-gray-500 hover:text-gray-900">
              <ArrowLeft className="w-4 h-4 mr-1" /> Setup
            </Button>
            <span className="text-amber-700 font-semibold text-sm">Step 1: Record Timings</span>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => markersFileInputRef.current?.click()} variant="ghost" size="sm" className="text-blue-500 hover:text-blue-700">
              <Upload className="w-4 h-4 mr-1" /> Load Markers
            </Button>
            <Button onClick={downloadMarkers} variant="ghost" size="sm"
              disabled={timestamps.length === 0}
              className="text-green-600 hover:text-green-800 disabled:opacity-40">
              <Download className="w-4 h-4 mr-1" /> Save Markers
            </Button>
            <Button onClick={goToPlayback} size="sm" className="bg-green-600 hover:bg-green-700 text-white">
              <CheckCircle className="w-4 h-4 mr-1" /> Done — Preview
            </Button>
          </div>
        </div>

        {isRemarkMode && !cycleComplete && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-blue-50 border-b border-blue-200 text-blue-700 text-xs font-medium">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            Re-marking group {timingGroup + 1} — timings for all other groups are preserved
          </div>
        )}
        {cycleComplete && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-green-50 border-b border-green-200 text-green-800 text-xs font-medium">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
            Cycle {numCycles} complete. Play audio at a new position and press Enter to mark the sloka again (Cycle {numCycles + 1}).
          </div>
        )}

        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex flex-col items-center justify-center border-b border-amber-100 px-6 py-4"
            style={{ background: "linear-gradient(160deg, #fef9f0 0%, #fdf3e7 100%)" }}>
            {(groups.length > 1 || numCycles > 1) && (
              <p className="text-xs text-amber-500 mb-1 font-medium">
                {numCycles > 1 && <span className="text-blue-500 mr-2">Cycle {numCycles}</span>}
                {groups.length > 1 && `Group ${timingGroup + 1} of ${groups.length}`}
              </p>
            )}
            <div className="flex flex-col items-center gap-y-1">
              {timingGroupLines.map((line, i) => (
                <p key={i} className="font-serif leading-relaxed text-center"
                  style={{ color: "#000000", fontSize: "clamp(13px, 1.8vw, 20px)", fontFamily: "'Mandali', 'Noto Sans Telugu', Georgia, serif" }}>
                  {line}
                </p>
              ))}
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 pt-5 pb-3 bg-gray-50 border-b border-gray-200">
              <p className="text-gray-600 text-sm mb-3">
                {!audioFile
                  ? "No audio file uploaded. Go back to Setup and add an audio file."
                  : cycleComplete
                  ? numCycles > 1
                    ? `Cycle ${numCycles} complete! Click Done to preview, or play audio and press Enter to mark this sloka again (Cycle ${numCycles + 1}).`
                    : "All words timed! Click Done to preview, or play audio at a different position and press Enter to mark this sloka again (e.g., when it repeats)."
                  : `Play audio → press Enter when you hear "${localItems[cycleTimingIndex]}"`}
              </p>
              <input
                ref={markersFileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={uploadMarkers}
              />
              <input
                ref={overlayImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleOverlayImageUpload}
              />
              <div className="flex items-center gap-3 flex-wrap">
                {audioFile && (
                  <Button onClick={toggleAudio} size="sm"
                    className={isPlaying ? "bg-amber-600 hover:bg-amber-700" : "bg-amber-700 hover:bg-amber-800"}>
                    {isPlaying ? <><Pause className="w-4 h-4 mr-1" /> Pause</> : <><Play className="w-4 h-4 mr-1" /> Play Audio</>}
                  </Button>
                )}
                <Button onClick={restartTiming} variant="ghost" size="sm" className="text-gray-500 hover:text-gray-800">
                  <RotateCcw className="w-4 h-4 mr-1" /> Restart
                </Button>
                {cycleTimingIndex > 0 && !cycleComplete && (
                  <Button onClick={finishCycle} variant="ghost" size="sm"
                    className="text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400"
                    title="Close this cycle and start marking the next occurrence">
                    ＋ Next Cycle
                  </Button>
                )}
                <span className="text-gray-400 text-xs font-mono">{formatTime(audioCurrentTime)}</span>
                <span className="text-gray-400 text-xs">
                  {cycleTimingIndex}/{numWords} timed
                  {numCycles > 1 && <span className="ml-1 text-amber-600">(Cycle {numCycles})</span>}
                </span>
                <Button onClick={openAddOverlay} variant="ghost" size="sm"
                  className="text-purple-600 hover:text-purple-800 ml-auto">
                  <Plus className="w-4 h-4 mr-1" /> Add Overlay
                </Button>
              </div>
              {audioDuration > 0 && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs font-mono text-amber-600 shrink-0 w-10 text-right">{formatTime(audioCurrentTime)}</span>
                  <input
                    type="range"
                    min={0}
                    max={audioDuration}
                    step={0.05}
                    value={audioCurrentTime}
                    onChange={(e) => {
                      const t = parseFloat(e.target.value);
                      if (audioRef.current) audioRef.current.currentTime = t;
                      setAudioCurrentTime(t);
                    }}
                    className="seek-bar flex-1 cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #d97706 0%, #d97706 ${progress}%, #e5e7eb ${progress}%, #e5e7eb 100%)`,
                      accentColor: "#d97706",
                    }}
                  />
                  <span className="text-xs font-mono text-gray-400 shrink-0 w-10">{formatTime(audioDuration)}</span>
                </div>
              )}

              {addingOverlay && (
                <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-purple-700 text-xs font-semibold flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" /> Add Overlay at {formatTime(pendingOverlayTime)}
                    </span>
                    <button onClick={() => setAddingOverlay(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Type className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                      <input
                        type="text"
                        placeholder="Text (optional)"
                        value={newOverlayText}
                        onChange={(e) => setNewOverlayText(e.target.value)}
                        className="flex-1 border border-purple-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-purple-400"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                      <button
                        onClick={() => overlayImageInputRef.current?.click()}
                        className="text-xs border border-purple-200 rounded px-2 py-1 bg-white hover:bg-purple-50 text-purple-700"
                      >
                        {newOverlayImageName || "Upload Image (optional)"}
                      </button>
                      {newOverlayImageDataUrl && (
                        <button onClick={() => { setNewOverlayImageDataUrl(""); setNewOverlayImageName(""); }} className="text-gray-400 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                    {newOverlayImageDataUrl && (
                      <img src={newOverlayImageDataUrl} alt="" className="max-h-16 rounded border border-purple-200 object-contain" />
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Show for</span>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={newOverlayDuration}
                        onChange={(e) => setNewOverlayDuration(Number(e.target.value))}
                        className="w-16 border border-purple-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-purple-400"
                      />
                      <span className="text-xs text-gray-500">seconds</span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveOverlay}
                        disabled={!newOverlayText.trim() && !newOverlayImageDataUrl}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-xs">
                        <Check className="w-3.5 h-3.5 mr-1" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAddingOverlay(false)} className="text-gray-500 text-xs">Cancel</Button>
                    </div>
                  </div>
                </div>
              )}

              {overlays.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-semibold text-purple-600 flex items-center gap-1"><Layers className="w-3 h-3" /> Overlays ({overlays.length})</p>
                  {overlays.map((ov) => (
                    <div key={ov.id} className="flex items-center gap-2 px-2 py-1.5 bg-purple-50 rounded border border-purple-100 text-xs">
                      <span className="font-mono text-purple-500 shrink-0">{formatTime(ov.startTime)}</span>
                      <span className="text-gray-500 shrink-0">→ {ov.duration}s</span>
                      {ov.imageDataUrl && <img src={ov.imageDataUrl} alt="" className="h-6 w-8 object-cover rounded shrink-0" />}
                      {ov.text && <span className="text-gray-700 truncate max-w-[120px]">{ov.text}</span>}
                      <button onClick={() => deleteOverlay(ov.id)} className="ml-auto text-gray-300 hover:text-red-400 shrink-0"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6" ref={wordListRef}>
              <div className="space-y-4 max-w-lg">
                {groups.map((group, groupIdx) => {
                  const groupStart = groupStartIndices[groupIdx];
                  const isCurrentGroup = groupIdx === getTimingDisplayGroup(Math.min(cycleTimingIndex, numWords - 1));
                  const groupEnd = groupStart + group.words.length;
                  const groupFullyTimed = cycleTimingIndex >= groupEnd;
                  return (
                    <div key={groupIdx}>
                      <div className={`flex items-center justify-between mb-1 px-1 ${isCurrentGroup ? "text-amber-700" : "text-gray-400"}`}>
                        <button
                          onClick={() => markGroupStart(groupIdx)}
                          title="Click to mark this group's start at the current audio position"
                          className={`text-xs font-semibold flex items-center gap-1 rounded px-1 py-0.5 transition-colors
                            ${isCurrentGroup
                              ? "text-amber-700 bg-amber-50 hover:bg-amber-100"
                              : "text-gray-400 hover:text-amber-600 hover:bg-amber-50"}`}
                        >
                          Lines {groupIdx * 2 + 1}–{Math.min(groupIdx * 2 + 2, groups.flatMap(g => g.lines).length)}
                          <span className="opacity-50 text-[9px] leading-none">●</span>
                        </button>
                        {groupFullyTimed && (
                          retimeMenuGroup === groupIdx ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-400 mr-1">Re-time:</span>
                              <button
                                onClick={() => retimeFromGroup(groupIdx, true)}
                                className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-700 px-2 py-0.5 rounded transition-colors"
                              >
                                Reset audio
                              </button>
                              <button
                                onClick={() => retimeFromGroup(groupIdx, false)}
                                className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-2 py-0.5 rounded transition-colors"
                              >
                                Keep position
                              </button>
                              <button onClick={() => setRetimeMenuGroup(null)} className="text-gray-300 hover:text-gray-500 ml-1">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setRetimeMenuGroup(groupIdx)}
                              className="text-xs text-gray-400 hover:text-amber-600 flex items-center gap-1 transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" /> Re-time from here
                            </button>
                          )
                        )}
                      </div>
                      <div className="space-y-1">
                        {group.words.map((_, wordIdx) => {
                          const i = groupStart + wordIdx;
                          const word = localItems[i];
                          const isCurrent = i === cycleTimingIndex;
                          const isDone = i < cycleTimingIndex;
                          const isEditing = editingIndex === i;
                          return (
                            <div
                              key={i}
                              ref={isCurrent ? activeWordRef : undefined}
                              className="group flex items-center gap-3 px-3 py-2 rounded-lg transition-all"
                              style={{
                                background: isEditing ? "#eff6ff" : isCurrent ? `${highlightColor}18` : "transparent",
                                borderLeft: isEditing ? "3px solid #3b82f6" : isCurrent ? `3px solid ${highlightColor}` : "3px solid transparent",
                              }}
                            >
                              <span className="text-xs font-mono w-12 shrink-0"
                                style={{ color: isDone ? "#16a34a" : isCurrent ? highlightColor : "#9ca3af" }}>
                                {isDone ? formatTime(timestamps[currentCycleOffset + i]) : isCurrent ? "▶ now" : `#${i + 1}`}
                              </span>

                              {isEditing ? (
                                <div className="flex items-center gap-2 flex-1">
                                  <input
                                    ref={editInputRef}
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    className="flex-1 bg-white text-gray-900 border border-blue-400 rounded px-2 py-0.5 text-sm outline-none focus:ring-1 focus:ring-blue-400"
                                    style={{ fontFamily: "'Mandali', 'Noto Sans Telugu', Georgia, serif" }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") { e.stopPropagation(); confirmEdit(); }
                                      if (e.key === "Escape") { e.stopPropagation(); cancelEdit(); }
                                    }}
                                  />
                                  <button onClick={confirmEdit} className="text-green-600 hover:text-green-700 p-0.5">
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600 p-0.5">
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span className="font-serif"
                                    style={{
                                      fontFamily: "'Mandali', 'Noto Sans Telugu', Georgia, serif",
                                      fontSize: isCurrent ? "20px" : isDone ? "16px" : "14px",
                                      color: isCurrent ? highlightColor : isDone ? "#374151" : "#d1d5db",
                                      fontWeight: isCurrent ? "700" : "400",
                                    }}>
                                    {word}
                                  </span>
                                  <button
                                    onClick={() => startEdit(i)}
                                    className="ml-auto opacity-0 group-hover:opacity-100 text-gray-300 hover:text-blue-500 transition-opacity p-0.5 shrink-0"
                                    title="Edit word"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
              <p className="text-gray-500 text-xs">
                Press <kbd className="px-1 py-0.5 bg-gray-200 rounded text-gray-600 text-xs">Enter</kbd> while audio plays to mark each word's start time
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const displayGroupLines = groups[displayGroup]?.lines ?? [];
  const displayGroupWords = groups[displayGroup]?.words ?? [];
  const displayGroupStart = groupStartIndices[displayGroup] ?? 0;

  return (
    <div className="bg-gray-50 flex flex-col"
      style={isRecording ? { position: "fixed", inset: 0, zIndex: 9999 } : { minHeight: "100vh" }}>
      {isRecording && (
        <div className="fixed top-3 right-3 z-[10000] flex items-center gap-2">
          <span className="bg-black/60 text-white text-xs font-mono px-3 py-1.5 rounded-full flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            REC {Math.floor(recordingTime / 60).toString().padStart(2, "0")}:{(recordingTime % 60).toString().padStart(2, "0")}
          </span>
          <button
            onClick={stopAndSaveRecording}
            className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg transition-colors"
          >
            ■ Stop &amp; Save
          </button>
        </div>
      )}

      {!isRecording && (
        <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={goBackToTiming} className="text-gray-500 hover:text-gray-800">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Timing
            </Button>
            <Button variant="ghost" size="sm" onClick={restartTiming} className="text-gray-400 hover:text-red-600" title="Clear all timestamps and start over">
              <RotateCcw className="w-4 h-4 mr-1" /> Restart
            </Button>
            <Button variant="ghost" size="sm" onClick={resetPreview} className="text-gray-500 hover:text-gray-800">
              <RotateCcw className="w-4 h-4 mr-1" /> Reset
            </Button>
            <span className="text-amber-700 text-xs font-semibold">Step 2: Preview &amp; Export</span>
            <span className="text-gray-300 text-xs">|</span>
            <span className="text-gray-500 text-xs font-mono">{formatTime(audioCurrentTime)}</span>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={toggleAudio} variant="ghost" size="sm"
              className="text-amber-700 hover:text-amber-800">
              {isPlaying ? <><Pause className="w-4 h-4 mr-1" /></> : <><Play className="w-4 h-4 mr-1" /></>}
              <span className="text-xs">{isPlaying ? "Pause" : "Play Preview"}</span>
            </Button>

            <div className="flex items-center gap-1 border border-gray-200 rounded px-2 py-1 bg-gray-50">
              <span className="text-gray-400 text-xs">Sync</span>
              <button
                onClick={() => { const v = Math.max(0, playbackOffset - 0.05); setPlaybackOffset(v); playbackOffsetRef.current = v; }}
                className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-800 font-bold text-sm rounded hover:bg-gray-200"
                title="Highlight later (−50 ms)"
              >−</button>
              <span className="text-xs font-mono text-gray-600 w-14 text-center">
                {playbackOffset >= 0 ? `+${Math.round(playbackOffset * 1000)}` : Math.round(playbackOffset * 1000)} ms
              </span>
              <button
                onClick={() => { const v = Math.min(1, playbackOffset + 0.05); setPlaybackOffset(v); playbackOffsetRef.current = v; }}
                className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-800 font-bold text-sm rounded hover:bg-gray-200"
                title="Highlight earlier (+50 ms)"
              >+</button>
            </div>

            <Button variant="ghost" size="sm" onClick={startRecording} className="text-red-400 hover:text-red-300">
              <Video className="w-4 h-4 mr-1" />
              <span className="text-xs">Record &amp; Export</span>
            </Button>

            {recordedBlob && (
              <Button variant="ghost" size="sm" onClick={downloadRecording} className="text-green-400 hover:text-green-300">
                <Download className="w-4 h-4 mr-1" />
                <span className="text-xs">Download</span>
              </Button>
            )}
          </div>
        </div>
      )}

      {!isRecording && audioDuration > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-100">
          <span className="text-xs font-mono text-amber-600 shrink-0 w-10 text-right">{formatTime(audioCurrentTime)}</span>
          <input
            type="range"
            min={0}
            max={audioDuration}
            step={0.05}
            value={audioCurrentTime}
            onChange={(e) => handlePlaybackSeek(parseFloat(e.target.value))}
            className="seek-bar flex-1 cursor-pointer"
            style={{
              background: `linear-gradient(to right, #d97706 0%, #d97706 ${progress}%, #e5e7eb ${progress}%, #e5e7eb 100%)`,
              accentColor: "#d97706",
            }}
          />
          <span className="text-xs font-mono text-gray-400 shrink-0 w-10">{formatTime(audioDuration)}</span>
        </div>
      )}

      <div className="flex flex-col flex-1 overflow-hidden relative">
        {(() => {
          const activeOverlays = overlays.filter(
            (o) => audioCurrentTime >= o.startTime && audioCurrentTime < o.startTime + o.duration
          );
          const ov = activeOverlays[activeOverlays.length - 1] ?? null;

          if (ov) {
            return (
              <div className="flex flex-col flex-1 items-center justify-center bg-white w-full px-4">
                {ov.imageDataUrl && (
                  <img src={ov.imageDataUrl} alt="" className="max-h-48 max-w-full rounded-lg object-contain mb-4" />
                )}
                {ov.text && (
                  <p className="text-center font-semibold leading-tight w-full"
                    style={{
                      fontFamily: "'Mandali', 'Noto Sans Telugu', Georgia, serif",
                      fontSize: "clamp(28px, 5vw, 64px)",
                      color: "#1a1a1a",
                      padding: "0 2%",
                      wordBreak: "break-word",
                    }}>
                    {ov.text}
                  </p>
                )}
              </div>
            );
          }

          return (
            <>
              <div className="flex flex-col items-center justify-center px-6 py-4"
                style={{ background: "#ffffff" }}>
                {groups.length > 1 && (
                  <p className="text-xs text-amber-400 mb-1">
                    {displayGroup + 1} / {groups.length}
                  </p>
                )}
                <div className="flex flex-col items-center gap-y-1">
                  {displayGroupLines.map((line, i) => (
                    <p key={i} className="font-serif leading-relaxed text-center"
                      style={{ color: "#000000", fontSize: `${slokaFontSize}px`, fontFamily: "'Mandali', 'Noto Sans Telugu', Georgia, serif", fontWeight: slokaBold ? "700" : "400", fontStyle: slokaItalic ? "italic" : "normal" }}>
                      {line}
                    </p>
                  ))}
                </div>
              </div>

              <div className="w-full relative" style={{ height: "3px" }}>
                <div className="absolute inset-0" style={{ background: "linear-gradient(to right, transparent 0%, rgba(255,215,0,0.15) 5%, rgba(255,215,0,1) 35%, rgba(255,255,180,1) 50%, rgba(255,215,0,1) 65%, rgba(255,215,0,0.15) 95%, transparent 100%)", boxShadow: "0 0 12px 4px rgba(255,215,0,0.6), 0 0 24px 8px rgba(255,200,0,0.3), 0 0 2px 1px rgba(255,255,200,0.9)" }} />
              </div>

              <div className="flex-1 flex items-start justify-start overflow-x-auto overflow-y-hidden pt-12 pb-6 gap-8"
                style={{ background: "#ffffff", paddingLeft: "10%", paddingRight: "16px" }}>
                {(() => {
                  const ROWS_PER_COL = 3;
                  const numCols = Math.ceil(displayGroupWords.length / ROWS_PER_COL);
                  return Array.from({ length: numCols }, (_, colIdx) => {
                    const colItems = displayGroupWords.slice(colIdx * ROWS_PER_COL, (colIdx + 1) * ROWS_PER_COL);
                    return (
                      <div key={`${displayGroup}-${colIdx}`} className="flex flex-col gap-24 shrink-0">
                        {colItems.map((_, rowIdx) => {
                          const globalIdx = displayGroupStart + colIdx * ROWS_PER_COL + rowIdx;
                          const item = localItems[globalIdx];
                          const activeWordIdx = currentIndex >= 0 && localItems.length > 0 ? currentIndex % localItems.length : -1;
                          const isActive = globalIdx === activeWordIdx;
                          const isPast = activeWordIdx >= 0 && globalIdx < activeWordIdx;
                          return (
                            <div key={globalIdx} className="flex items-center select-none"
                              style={{
                                fontSize: `${previousFontSize}px`,
                                color: isActive ? highlightColor : isPast ? "#000000" : "transparent",
                                fontFamily: "'Mandali', 'Noto Sans Telugu', Georgia, serif",
                                lineHeight: 1.3,
                                transform: isActive ? "scale(1.3)" : "scale(1)",
                                transformOrigin: "left center",
                                transition: "transform 250ms cubic-bezier(0.4,0,0.2,1), color 250ms cubic-bezier(0.4,0,0.2,1)",
                                textShadow: "none",
                                fontWeight: isActive ? "700" : "400",
                                whiteSpace: "nowrap",
                                willChange: "transform, color",
                                contain: "layout style",
                              }}>
                              <span className="inline-block mr-1 text-sm"
                                style={{ color: highlightColor, opacity: isActive ? 0.85 : 0, minWidth: "1em", transition: "opacity 250ms cubic-bezier(0.4,0,0.2,1)" }}>▶</span>
                              {item}
                            </div>
                          );
                        })}
                      </div>
                    );
                  });
                })()}
              </div>
            </>
          );
        })()}
      </div>

      {!isRecording && (
        <div className="px-4 py-2 bg-white border-t border-gray-200 flex items-center justify-between">
          <p className="text-gray-400 text-xs">
            {currentIndex >= 0 ? localItems[currentIndex] : "Waiting for playback…"}
          </p>
          <p className="text-gray-400 text-xs">{localItems.length} words · {timestamps.length} timestamps recorded</p>
        </div>
      )}

      <canvas ref={canvasRef} width={1280} height={720} style={{ display: "none" }} />
    </div>
  );
}
