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

const ANIM_DURATION = 250;
let _canvasPrevActiveIdx = -1;
let _canvasActiveChangeTime = -1;

function parseHexColor(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return [r, g, b];
}

function lerpColor(c1: [number, number, number], c2: [number, number, number], t: number): string {
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
  return `rgb(${r},${g},${b})`;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

const UNHIGHLIGHT_DURATION = 400;
let _canvasPrevHighlightCleared = false;
let _canvasUnhighlightStartTime = 0;

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [text];
  const measured = ctx.measureText(text).width;
  if (measured <= maxWidth) return [text];
  const words = text.split(" ");
  if (words.length > 1) {
    const lines: string[] = [];
    let cur = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = cur + " " + words[i];
      if (ctx.measureText(test).width > maxWidth && cur) {
        lines.push(cur);
        cur = words[i];
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines.length > 0 ? lines : [text];
  }
  const chars = [...text];
  const lines: string[] = [];
  let cur = "";
  for (const ch of chars) {
    const test = cur + ch;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = ch;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawCanvasFrame(
  canvas: HTMLCanvasElement | null,
  activeIdx: number,
  ds: {
    groupLines: string[]; groupWords: string[]; groupStart: number;
    slokaFontSize: number; previousFontSize: number; highlightedFontSize: number; highlightColor: string;
    slokaColor: string; overlayTextColor: string; pastWordColor: string;
    slokaBold: boolean; slokaItalic: boolean; highlightCleared: boolean;
    overlays: OverlayMarker[]; localItems: string[];
    colXFractions: number[];
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
    ctx.font = `bold ${fontSize}px 'Noto Sans Telugu','Noto Serif Telugu','Mandali',Georgia,serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const words = activeOv.text.split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width > W * 0.82 && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    const lh = fontSize * 1.35;
    const maxLineW = lines.reduce((m, ln) => Math.max(m, ctx.measureText(ln).width), 0);
    const padX = fontSize * 1.1;
    const padY = fontSize * 0.7;
    const boxW = maxLineW + padX * 2;
    const boxH = lines.length * lh + padY * 2;
    const boxX = W / 2 - boxW / 2;
    const boxY = H / 2 - boxH / 2;
    const r = fontSize * 0.55;
    // Draw rounded rectangle border
    ctx.beginPath();
    ctx.moveTo(boxX + r, boxY);
    ctx.lineTo(boxX + boxW - r, boxY);
    ctx.arcTo(boxX + boxW, boxY, boxX + boxW, boxY + r, r);
    ctx.lineTo(boxX + boxW, boxY + boxH - r);
    ctx.arcTo(boxX + boxW, boxY + boxH, boxX + boxW - r, boxY + boxH, r);
    ctx.lineTo(boxX + r, boxY + boxH);
    ctx.arcTo(boxX, boxY + boxH, boxX, boxY + boxH - r, r);
    ctx.lineTo(boxX, boxY + r);
    ctx.arcTo(boxX, boxY, boxX + r, boxY, r);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fill();
    ctx.strokeStyle = "#c8a84b";
    ctx.lineWidth = Math.max(2, W * 0.004);
    ctx.stroke();
    // Draw text inside the box
    ctx.fillStyle = ds.overlayTextColor;
    const startY = H / 2 - ((lines.length - 1) * lh) / 2;
    lines.forEach((ln, i) => ctx.fillText(ln, W / 2, startY + i * lh));
    return;
  }

  const SF = Math.max(16, ds.slokaFontSize);
  const fontStyle = ds.slokaItalic ? "italic " : "";
  const fontWeight = ds.slokaBold ? "bold " : "";
  ctx.font = `${fontStyle}${fontWeight}${SF}px 'Noto Sans Telugu','Noto Serif Telugu','Mandali',Georgia,serif`;
  ctx.fillStyle = ds.slokaColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const slokaLineH = SF * 1.5;
  let slokaBottom = 36;
  ds.groupLines.forEach((line, i) => {
    ctx.fillText(line, W / 2, slokaBottom + i * slokaLineH);
  });
  slokaBottom += ds.groupLines.length * slokaLineH + 16;

  const divY = slokaBottom;
  const lensH = 6;
  const lensMid = divY + lensH / 2;
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0,    "rgba(218,165,32,0)");
  grad.addColorStop(0.35, "rgba(255,215,0,0.9)");
  grad.addColorStop(0.5,  "rgba(255,232,124,1)");
  grad.addColorStop(0.65, "rgba(255,215,0,0.9)");
  grad.addColorStop(1,    "rgba(218,165,32,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, lensMid);
  ctx.quadraticCurveTo(W / 2, divY,          W, lensMid);
  ctx.quadraticCurveTo(W / 2, divY + lensH,  0, lensMid);
  ctx.closePath();
  ctx.fill();

  const wordCount = ds.groupWords.length;
  const MAX_COLS = 3;
  let ROWS = 3;
  if (wordCount > MAX_COLS * 3) {
    ROWS = Math.ceil(wordCount / MAX_COLS);
  }
  const numCols0 = Math.ceil(wordCount / ROWS);
  const maxChars = ds.groupWords.reduce((m: number, w: string) => Math.max(m, [...w].length), 0);
  const avgColPct = numCols0 > 0 ? (100 / numCols0) : 100;
  const charThreshold = avgColPct < 30 ? 8 : avgColPct < 40 ? 10 : 14;
  let longWordScale = 1;
  if (maxChars > charThreshold) {
    longWordScale = Math.max(0.5, charThreshold / maxChars);
  }
  const rowScale = ROWS > 3 ? 0.7 : 1;
  const fontScale = Math.max(0.7, Math.min(rowScale, longWordScale));
  const WF = Math.max(10, ds.previousFontSize * fontScale);
  const WFA = Math.max(10, ds.highlightedFontSize * fontScale);
  const rowGap = Math.max(Math.max(WF, WFA) * 2.4, ROWS > 3 ? 36 : 56);
  const wordsY = divY + (ROWS > 3 ? 24 : 48);

  const numCols = Math.ceil(wordCount / ROWS);

  // Use DOM-measured column fractions — the HTML preview shows correct layout,
  // so we map those proportional positions onto the canvas.  This avoids
  // ctx.measureText() over-estimating Telugu glyph widths and clipping columns.
  const colXFractions = ds.colXFractions || [];
  const rColX = colXFractions.length >= numCols
    ? colXFractions.map((f: number) => W * 0.025 + f * (W * 0.95))
    : Array.from({ length: numCols }, (_, c) => W * 0.025 + c * ((W * 0.95) / numCols));

  // Arrow width for drawing the active-word marker.
  ctx.font = `bold ${WFA}px 'Noto Sans Telugu','Noto Serif Telugu','Mandali',Georgia,serif`;
  const arrowW = ctx.measureText("▶ ").width;

  const SAFE_RIGHT = W * 0.02;

  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  const numWordsInCanvas = ds.localItems.length;
  const activeWordIdx = numWordsInCanvas > 0 && activeIdx >= 0 ? activeIdx % numWordsInCanvas : -1;

  const now = performance.now();
  if (activeWordIdx !== _canvasPrevActiveIdx) {
    _canvasActiveChangeTime = now;
    _canvasPrevActiveIdx = activeWordIdx;
  }

  if (ds.highlightCleared && !_canvasPrevHighlightCleared) {
    _canvasUnhighlightStartTime = now;
  }
  _canvasPrevHighlightCleared = ds.highlightCleared;

  const rawT = _canvasActiveChangeTime > 0 ? Math.min((now - _canvasActiveChangeTime) / ANIM_DURATION, 1) : 1;
  const t = easeOutCubic(rawT);

  let unhighlightT = 1;
  if (ds.highlightCleared && _canvasUnhighlightStartTime > 0) {
    const rawU = Math.min((now - _canvasUnhighlightStartTime) / UNHIGHLIGHT_DURATION, 1);
    unhighlightT = easeOutCubic(rawU);
  }

  const highlightRGB = parseHexColor(ds.highlightColor);
  const pastRGB = parseHexColor(ds.pastWordColor);

  const colWidth = numCols > 0 ? (W * 0.95) / numCols : W * 0.95;

  for (let i = 0; i < ds.groupWords.length; i++) {
    const globalIdx = ds.groupStart + i;
    const item = ds.localItems[globalIdx];
    if (!item) continue;
    const wasActive = globalIdx === activeWordIdx;
    const isActive = !ds.highlightCleared && wasActive;
    const isPast = activeWordIdx >= 0 && (ds.highlightCleared ? globalIdx <= activeWordIdx : globalIdx < activeWordIdx);
    if (!isActive && !isPast) continue;
    const col = Math.floor(i / ROWS);
    const row = i % ROWS;
    const x = rColX[col];
    if (x > W - SAFE_RIGHT) continue;
    const y = wordsY + row * rowGap;
    const maxTextW = colWidth - arrowW - 4;

    if (isActive) {
      const fontSize = WF + (WFA - WF) * t;
      ctx.font = `bold ${fontSize}px 'Noto Sans Telugu','Noto Serif Telugu','Mandali',Georgia,serif`;
      ctx.fillStyle = ds.highlightColor;
      const wrapped = wrapCanvasText(ctx, item, maxTextW);
      ctx.fillText("▶ ", x, y);
      wrapped.forEach((ln, li) => ctx.fillText(ln, x + arrowW, y + li * fontSize * 1.3));
    } else if (ds.highlightCleared && wasActive && unhighlightT < 1) {
      const fontSize = WFA + (WF - WFA) * unhighlightT;
      ctx.font = `${unhighlightT < 0.5 ? "bold " : ""}${fontSize}px 'Noto Sans Telugu','Noto Serif Telugu','Mandali',Georgia,serif`;
      ctx.fillStyle = lerpColor(highlightRGB, pastRGB, unhighlightT);
      const wrapped = wrapCanvasText(ctx, item, maxTextW);
      const arrowOpacity = 0.85 * (1 - unhighlightT);
      if (arrowOpacity > 0.01) {
        ctx.save();
        ctx.globalAlpha = arrowOpacity;
        ctx.fillText("▶ ", x, y);
        ctx.restore();
        wrapped.forEach((ln, li) => ctx.fillText(ln, x + arrowW, y + li * fontSize * 1.3));
      } else {
        wrapped.forEach((ln, li) => ctx.fillText(ln, x, y + li * fontSize * 1.3));
      }
    } else {
      ctx.font = `${WF}px 'Noto Sans Telugu','Noto Serif Telugu','Mandali',Georgia,serif`;
      ctx.fillStyle = ds.pastWordColor;
      const wrapped = wrapCanvasText(ctx, item, colWidth - 4);
      wrapped.forEach((ln, li) => ctx.fillText(ln, x, y + li * WF * 1.3));
    }
  }
}

export default function DisplayPage({ data, onBack }: DisplayPageProps) {
  const { groups: rawGroups, audioFile, highlightColor, slokaColor, overlayTextColor, pastWordColor, highlightedFontSize, previousFontSize, slokaFontSize, slokaBold, slokaItalic } = data;
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
  const [highlightCleared, setHighlightCleared] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [displayGroup, setDisplayGroup] = useState(0);
  const [groupTransitionTimes, setGroupTransitionTimes] = useState<Record<number, number[]>>({});
  const groupTransitionTimesRef = useRef<Record<number, number[]>>({});
  const lastDisplayGroupRef = useRef(0);
  const groupStartIndicesRef = useRef<number[]>(groupStartIndices);
  const numGroupsRef = useRef(groups.length);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

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
  const lastWordClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClearedIdxRef = useRef<number | null>(null);
  const lastWordHitTimeRef = useRef<number>(-1);
  const markersFileInputRef = useRef<HTMLInputElement>(null);
  const overlayImageInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wordColsContainerRef = useRef<HTMLDivElement>(null);
  const colDivRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isRecordingRef = useRef(false);
  const displayStateRef = useRef({
    groupLines: [] as string[],
    groupWords: [] as string[],
    groupStart: 0,
    slokaFontSize: 32,
    previousFontSize: 28,
    highlightedFontSize: 48,
    highlightColor: "#f59e0b",
    slokaColor: "#000000",
    overlayTextColor: "#1a1a1a",
    pastWordColor: "#000000",
    slokaBold: false,
    slokaItalic: false,
    highlightCleared: false,
    overlays: [] as OverlayMarker[],
    localItems: [] as string[],
    colXFractions: [] as number[],
  });

  const [overlays, setOverlays] = useState<OverlayMarker[]>([]);
  const [addingOverlay, setAddingOverlay] = useState(false);
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);
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
    // Measure actual rendered column positions from DOM so the canvas layout
    // exactly matches the HTML preview — bypassing ctx.measureText() which
    // is inaccurate for complex scripts like Telugu.
    let colXFractions: number[] = [];
    const container = wordColsContainerRef.current;
    if (container) {
      const containerRect = container.getBoundingClientRect();
      const cw = containerRect.width;
      if (cw > 0) {
        colXFractions = colDivRefs.current
          .filter(Boolean)
          .map((el) => (el!.getBoundingClientRect().left - containerRect.left) / cw);
      }
    }
    displayStateRef.current = {
      groupLines: groups[displayGroup]?.lines ?? [],
      groupWords: groups[displayGroup]?.words ?? [],
      groupStart: groupStartIndices[displayGroup] ?? 0,
      slokaFontSize,
      previousFontSize,
      highlightedFontSize,
      highlightColor,
      slokaColor,
      overlayTextColor,
      pastWordColor,
      slokaBold,
      slokaItalic,
      highlightCleared,
      overlays,
      localItems,
      colXFractions,
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
      if (phaseRef.current === "timing") {
        setIsPlaying(false);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        const next = [...timestampsRef.current];
        const startIdx = timingIndexRef.current;
        const nw = localItemsLenRef.current;
        const cycleEnd = nw > 0 ? (Math.floor(startIdx / nw) + 1) * nw : startIdx;
        timestampsRef.current = next;
        timingIndexRef.current = cycleEnd;
        setTimestamps([...next]);
        setTimingIndex(cycleEnd);
        audioEndedInTimingRef.current = true;
        return;
      }
      if (isRecordingRef.current && mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        const keepDrawing = () => {
          if (!isRecordingRef.current) return;
          drawCanvasFrame(canvasRef.current, lastActiveRef.current, displayStateRef.current, audioRef.current?.duration ?? 0);
          rafRef.current = requestAnimationFrame(keepDrawing);
        };
        rafRef.current = requestAnimationFrame(keepDrawing);
        setTimeout(() => {
          if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            autoDownloadRef.current = true;
            mediaRecorderRef.current.stop();
          }
          setIsRecording(false);
          setIsPlaying(false);
          if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        }, 5500);
      } else {
        setIsPlaying(false);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
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
    const ahead = t + playbackOffsetRef.current;
    if (ts.length > 0) {
      let bestTime = -Infinity;
      for (let i = 0; i < ts.length; i++) {
        if (ts[i] != null && ahead >= ts[i] && (ts[i] as number) > bestTime) {
          bestTime = ts[i] as number;
          active = i;
        }
      }
    }
    if (active !== lastActiveRef.current) {
      // If the incoming active word is the one we intentionally cleared, just
      // silently re-sync lastActiveRef so the tick stays quiet — do NOT restore
      // the highlight or cancel the cleared state.
      if (active === lastClearedIdxRef.current) {
        lastActiveRef.current = active;
      } else {
        lastClearedIdxRef.current = null;
        lastActiveRef.current = active;
        lastWordHitTimeRef.current = -1;
        setHighlightCleared(false);
        displayStateRef.current = { ...displayStateRef.current, highlightCleared: false };
        setCurrentIndex(active);
        const nw2 = localItemsLenRef.current;
        const localIdx = nw2 > 0 ? active % nw2 : -1;
        const gsi = groupStartIndicesRef.current;
        let isLastInGroup = false;
        if (localIdx >= 0) {
          let groupOfActive = 0;
          for (let gi = gsi.length - 1; gi >= 0; gi--) {
            if (localIdx >= gsi[gi]) { groupOfActive = gi; break; }
          }
          const groupEnd = groupOfActive + 1 < gsi.length ? gsi[groupOfActive + 1] - 1 : nw2 - 1;
          isLastInGroup = localIdx === groupEnd;
        }
        let isLastTimedInCycle = false;
        if (phaseRef.current === "playback" && nw2 > 0 && active >= 0) {
          const base = Math.floor(active / nw2) * nw2;
          const cycleEnd = Math.min(base + nw2, ts.length);
          let foundLater = false;
          for (let j = active + 1; j < cycleEnd; j++) {
            if (ts[j] != null) { foundLater = true; break; }
          }
          isLastTimedInCycle = !foundLater;
        }
        if (active >= 0 && (isLastInGroup || isLastTimedInCycle)) {
          lastWordHitTimeRef.current = performance.now();
          if (lastWordClearTimerRef.current) clearTimeout(lastWordClearTimerRef.current);
          lastWordClearTimerRef.current = setTimeout(() => {
            lastWordClearTimerRef.current = null;
            if (lastWordHitTimeRef.current > 0) {
              lastClearedIdxRef.current = active;
              lastWordHitTimeRef.current = -1;
              setHighlightCleared(true);
              displayStateRef.current = { ...displayStateRef.current, highlightCleared: true };
            }
          }, 5000);
        }
      }
    }

    // Every frame: check if 5 seconds have passed since the last word in a group was highlighted.
    if (
      lastWordHitTimeRef.current > 0 &&
      !displayStateRef.current.highlightCleared &&
      performance.now() - lastWordHitTimeRef.current >= 5000
    ) {
      lastClearedIdxRef.current = lastActiveRef.current;
      lastWordHitTimeRef.current = -1;
      if (lastWordClearTimerRef.current) { clearTimeout(lastWordClearTimerRef.current); lastWordClearTimerRef.current = null; }
      setHighlightCleared(true);
      displayStateRef.current = { ...displayStateRef.current, highlightCleared: true };
    }

    // Compute display group every frame for smooth group transitions.
    // groupTransitionTimes is a flat sorted list of absolute audio times — no
    // per-cycle indexing. A time fires when it falls within the current
    // repetition's window [repStart, ahead].
    const nw = localItemsLenRef.current;
    const cycleIdx = (nw > 0 && active >= 0) ? Math.floor(active / nw) : 0;
    const numGroups = numGroupsRef.current;
    const numTrans = Math.max(0, numGroups - 1);
    // Find the earliest timestamp in the current cycle (= repetition start).
    let repStart = -Infinity;
    if (nw > 0) {
      const base = cycleIdx * nw;
      for (let w = base; w < Math.min(base + nw, ts.length); w++) {
        const wt = ts[w];
        if (wt != null && (repStart === -Infinity || (wt as number) < repStart))
          repStart = wt as number;
      }
    }
    // Per-transition keyed map of absolute audio times.
    const perTransTimes = groupTransitionTimesRef.current ?? {};
    // Word-boundary group (always computed as floor).
    let wbGroup = 0;
    if (active >= 0) {
      const wi = nw > 0 ? active % nw : active;
      const gsi = groupStartIndicesRef.current;
      for (let i = gsi.length - 1; i >= 0; i--) {
        if (wi >= gsi[i]) { wbGroup = i; break; }
      }
    }
    // Transition-triggered group: each transIdx checked independently.
    let transGroup = 0;
    if (numTrans > 0 && repStart > -Infinity) {
      for (let tr = 0; tr < numTrans; tr++) {
        const times = (perTransTimes[tr] ?? []) as number[];
        if (times.some(t => t >= repStart && t <= ahead)) {
          transGroup = Math.min(tr + 1, numGroups - 1);
        }
      }
    }
    let newGroup = Math.max(wbGroup, transGroup);
    if (newGroup !== lastDisplayGroupRef.current) {
      lastDisplayGroupRef.current = newGroup;
      setDisplayGroup(newGroup);
      const g = groupsRef.current[newGroup];
      if (g) {
        displayStateRef.current = {
          ...displayStateRef.current,
          groupLines: g.lines ?? [],
          groupWords: g.words ?? [],
          groupStart: groupStartIndicesRef.current[newGroup] ?? 0,
        };
      }
    }

    if (isRecordingRef.current) {
      drawCanvasFrame(canvasRef.current, lastActiveRef.current, displayStateRef.current, t);
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
    const wasAlreadyMarked = next[idx] !== undefined && next[idx] !== null;
    next[idx] = t;
    const cycleEnd = (Math.floor(idx / numWords) + 1) * numWords;
    let nextIdx = idx + 1;
    if (!wasAlreadyMarked) {
      while (nextIdx < cycleEnd && next[nextIdx] !== undefined && (next[nextIdx] as unknown) !== null) {
        nextIdx++;
      }
    }
    timestampsRef.current = next;
    timingIndexRef.current = nextIdx;
    setTimestamps(next);
    setTimingIndex(nextIdx);
    const nextCycleLocal = nextIdx % numWords;
    const newTabGroup = getTimingDisplayGroup(Math.min(nextCycleLocal, numWords - 1));
    setDisplayGroup(newTabGroup);
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
    lastClearedIdxRef.current = null;
    lastWordHitTimeRef.current = -1;
    setHighlightCleared(false);
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
    if (lastWordClearTimerRef.current) { clearTimeout(lastWordClearTimerRef.current); lastWordClearTimerRef.current = null; }
    lastActiveRef.current = -1;
    lastDisplayGroupRef.current = 0;
    lastClearedIdxRef.current = null;
    lastWordHitTimeRef.current = -1;
    setHighlightCleared(false);
    setCurrentIndex(-1);
    setAudioCurrentTime(0);
    setDisplayGroup(0);
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  };

  const handlePlaybackSeek = (seekT: number) => {
    if (audioRef.current) audioRef.current.currentTime = seekT;
    setAudioCurrentTime(seekT);
    if (lastWordClearTimerRef.current) { clearTimeout(lastWordClearTimerRef.current); lastWordClearTimerRef.current = null; }
    lastClearedIdxRef.current = null;
    lastWordHitTimeRef.current = -1;
    setHighlightCleared(false);
    const ts = timestampsRef.current;
    const ahead = seekT + playbackOffsetRef.current;
    let active = -1;
    for (let i = ts.length - 1; i >= 0; i--) {
      if (ts[i] != null && ahead >= ts[i]) { active = i; break; }
    }
    lastActiveRef.current = active;
    setCurrentIndex(active);
    // Compute display group — same repStart-window logic as tick.
    const nw = localItems.length;
    const cycleIdx = (nw > 0 && active >= 0) ? Math.floor(active / nw) : 0;
    const numTrans = Math.max(0, groups.length - 1);
    let repStart = -Infinity;
    if (nw > 0) {
      const base = cycleIdx * nw;
      const ts2 = timestampsRef.current;
      for (let w = base; w < Math.min(base + nw, ts2.length); w++) {
        const wt = ts2[w];
        if (wt != null && (repStart === -Infinity || (wt as number) < repStart))
          repStart = wt as number;
      }
    }
    const perTransTimes2 = groupTransitionTimesRef.current ?? {};
    let wbGroup2 = 0;
    if (active >= 0) {
      const wi = nw > 0 ? active % nw : active;
      for (let i = groupStartIndices.length - 1; i >= 0; i--) {
        if (wi >= groupStartIndices[i]) { wbGroup2 = i; break; }
      }
    }
    let transGroup2 = 0;
    if (numTrans > 0 && repStart > -Infinity) {
      for (let tr = 0; tr < numTrans; tr++) {
        const times2 = (perTransTimes2[tr] ?? []) as number[];
        if (times2.some(t => t >= repStart && t <= ahead)) {
          transGroup2 = Math.min(tr + 1, groups.length - 1);
        }
      }
    }
    const newGroup = Math.max(wbGroup2, transGroup2);
    lastDisplayGroupRef.current = newGroup;
    setDisplayGroup(newGroup);
  };

  const [retimeMenuGroup, setRetimeMenuGroup] = useState<number | null>(null);

  const finishCycle = () => {
    const nw = localItemsLenRef.current;
    const curTi = timingIndexRef.current;
    if (nw === 0) return;
    const cycleIndex = Math.floor(curTi / nw);
    const cycleEnd = (cycleIndex + 1) * nw;
    timingIndexRef.current = cycleEnd;
    audioEndedInTimingRef.current = false;
    setTimingIndex(cycleEnd);
  };

  const markGroupStart = (groupIdx: number) => {
    const nw = localItemsLenRef.current;
    const curTi = timingIndexRef.current;
    if (nw === 0) return;
    const gStart = groupStartIndices[groupIdx];
    const gEnd = groupIdx + 1 < groupStartIndices.length ? groupStartIndices[groupIdx + 1] : nw;
    const curCycleIndex = Math.floor(curTi / nw);
    const curCycleOffset = curCycleIndex * nw;
    const ts = timestampsRef.current;
    // If this group already has any marks in the current cycle → start a NEW cycle
    const hasMarks = ts.slice(curCycleOffset + gStart, curCycleOffset + gEnd)
      .some(t => t !== undefined && t !== null);
    const targetCycleOffset = hasMarks ? (curCycleIndex + 1) * nw : curCycleOffset;
    const startIdx = targetCycleOffset + gStart;
    const groupEndIdx = targetCycleOffset + gEnd;
    const existing = [...ts];
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
    const cycleIndex = Math.floor(curTi / nw);
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
    lastClearedIdxRef.current = null;
    lastWordHitTimeRef.current = -1;
    setHighlightCleared(false);
    setCurrentIndex(-1);
    setRetimeMenuGroup(null);
  };

  // groupTransitionTimes is a per-transition-index map: Record<transIdx, number[]>.
  // Each entry between sections (transIdx 0 = between section 1 and 2, etc.) has
  // its own independent list of absolute audio times.
  const markGroupTransition = (transIdx: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const numTrans = Math.max(0, numGroupsRef.current - 1);
    if (numTrans <= 0 || transIdx < 0 || transIdx >= numTrans) return;
    const t = audio.currentTime;
    setGroupTransitionTimes(prev => {
      const updated = { ...prev };
      const existing = [...(updated[transIdx] ?? [])];
      existing.push(t);
      existing.sort((a, b) => a - b);
      updated[transIdx] = existing;
      groupTransitionTimesRef.current = updated;
      return updated;
    });
  };

  const removeGroupTransition = (transIdx: number, timeValue: number) => {
    setGroupTransitionTimes(prev => {
      const updated = { ...prev };
      const existing = [...(updated[transIdx] ?? [])];
      const idx = existing.indexOf(timeValue);
      if (idx < 0) return prev;
      existing.splice(idx, 1);
      updated[transIdx] = existing;
      groupTransitionTimesRef.current = updated;
      return updated;
    });
  };

  const removeTimestamp = (cycleIdx: number, wordIdx: number) => {
    const nw = localItemsLenRef.current;
    const flatIdx = cycleIdx * nw + wordIdx;
    const existing = [...timestampsRef.current];
    if (flatIdx < existing.length) {
      existing[flatIdx] = undefined as unknown as number;
      timestampsRef.current = existing;
      setTimestamps([...existing]);
    }
  };

  const [editingTimestamp, setEditingTimestamp] = useState<{ cycleIdx: number; wordIdx: number } | null>(null);
  const [editingTimestampValue, setEditingTimestampValue] = useState("");

  const startEditTimestamp = (cycleIdx: number, wordIdx: number, currentVal: number) => {
    setEditingTimestamp({ cycleIdx, wordIdx });
    setEditingTimestampValue(formatTime(currentVal));
  };

  const saveEditTimestamp = () => {
    if (!editingTimestamp) return;
    const parts = editingTimestampValue.split(":");
    let seconds = 0;
    if (parts.length === 2) {
      seconds = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    } else {
      seconds = parseFloat(editingTimestampValue);
    }
    if (isNaN(seconds) || seconds < 0) { setEditingTimestamp(null); return; }
    const nw = localItemsLenRef.current;
    const flatIdx = editingTimestamp.cycleIdx * nw + editingTimestamp.wordIdx;
    const existing = [...timestampsRef.current];
    if (flatIdx < existing.length) {
      existing[flatIdx] = seconds;
      timestampsRef.current = existing;
      setTimestamps([...existing]);
    }
    setEditingTimestamp(null);
  };

  // Seek audio to a specific time (used by clickable timestamp chips).
  const seekToTime = (t: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = t;
    setAudioCurrentTime(t);
  };

  // Move the timing cursor to a specific word so it can be re-marked.
  // If the cursor sits at a cycle boundary (all words marked, about to start
  // a new cycle), step back to the just-completed cycle so re-marks update the
  // existing timestamps instead of writing into a new cycle.
  const jumpToWord = (wordIdx: number) => {
    const nw = localItemsLenRef.current;
    if (nw === 0) return;
    let cycleIdx = Math.floor(timingIndexRef.current / nw);
    if (cycleIdx > 0 && timingIndexRef.current % nw === 0) {
      cycleIdx -= 1;
    }
    const newTi = cycleIdx * nw + wordIdx;
    timingIndexRef.current = newTi;
    setTimingIndex(newTi);
  };

  const goBackToTiming = () => {
    if (goToPlaybackTimerRef.current) { clearTimeout(goToPlaybackTimerRef.current); goToPlaybackTimerRef.current = null; }
    if (lastWordClearTimerRef.current) { clearTimeout(lastWordClearTimerRef.current); lastWordClearTimerRef.current = null; }
    const audio = audioRef.current;
    if (audio) { audio.pause(); }
    setIsPlaying(false);
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    lastActiveRef.current = -1;
    lastClearedIdxRef.current = null;
    lastWordHitTimeRef.current = -1;
    setHighlightCleared(false);
    setCurrentIndex(-1);
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
    lastClearedIdxRef.current = null;
    lastWordHitTimeRef.current = -1;
    setHighlightCleared(false);
    setCurrentIndex(-1);
    setDisplayGroup(0);
    setPhase("timing");
  };

  const startPlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    lastActiveRef.current = -1;
    lastDisplayGroupRef.current = 0;
    lastClearedIdxRef.current = null;
    lastWordHitTimeRef.current = -1;
    setHighlightCleared(false);
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
      // Wait for all fonts (including Telugu) to finish loading before
      // measuring or rendering — prevents layout shift on first frames.
      await document.fonts.ready;

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
      lastDisplayGroupRef.current = 0;
      lastClearedIdxRef.current = null;
      lastWordHitTimeRef.current = -1;
      setHighlightCleared(false);
      setCurrentIndex(-1);
      setDisplayGroup(0);
      setAudioCurrentTime(0);
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

      _canvasPrevActiveIdx = -1;
      _canvasActiveChangeTime = -1;
      _canvasPrevHighlightCleared = false;
      _canvasUnhighlightStartTime = 0;

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
    setEditingOverlayId(null);
    setAddingOverlay(true);
  };

  const editOverlay = (ov: OverlayMarker) => {
    setPendingOverlayTime(ov.startTime);
    setNewOverlayText(ov.text || "");
    setNewOverlayDuration(ov.duration);
    setNewOverlayImageDataUrl(ov.imageDataUrl || "");
    setNewOverlayImageName(ov.imageDataUrl ? "Current image" : "");
    setEditingOverlayId(ov.id);
    setAddingOverlay(true);
  };

  const saveOverlay = () => {
    if (!newOverlayText.trim() && !newOverlayImageDataUrl) return;
    if (editingOverlayId) {
      setOverlays((prev) => prev.map((o) =>
        o.id === editingOverlayId
          ? { ...o, startTime: pendingOverlayTime, duration: newOverlayDuration, text: newOverlayText.trim(), imageDataUrl: newOverlayImageDataUrl }
          : o
      ).sort((a, b) => a.startTime - b.startTime));
    } else {
      const marker: OverlayMarker = {
        id: `ov-${Date.now()}`,
        startTime: pendingOverlayTime,
        duration: newOverlayDuration,
        text: newOverlayText.trim(),
        imageDataUrl: newOverlayImageDataUrl,
      };
      setOverlays((prev) => [...prev, marker].sort((a, b) => a.startTime - b.startTime));
    }
    setEditingOverlayId(null);
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

  const fmtTs = (s: number | null | undefined): string | null => {
    if (s == null) return null;
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toFixed(1).padStart(4, "0");
    return `${m}:${sec}`;
  };

  const downloadMarkers = () => {
    const fmtGroupTransitionTimes: Record<string, (string | null)[]> = {};
    for (const key of Object.keys(groupTransitionTimes)) {
      fmtGroupTransitionTimes[key] = groupTransitionTimes[Number(key)].map(fmtTs);
    }
    const groupWordCounts = groups.map(g => g.words.length);
    const payload = {
      words: localItems,
      timestamps: timestamps.map(fmtTs),
      groupTransitionTimes: fmtGroupTransitionTimes,
      overlays: overlays.map(ov => ({ ...ov, startTime: fmtTs(ov.startTime), duration: fmtTs(ov.duration) })),
      audioDuration: fmtTs(audioRef.current?.duration ?? null),
      groupWordCounts,
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
        const parseTs = (v: unknown): number | null => {
          if (v == null) return null;
          if (typeof v === "number") return v;
          if (typeof v === "string") {
            const parts = v.match(/^(\d+):(\d+(?:\.\d+)?)$/);
            if (parts) return Number(parts[1]) * 60 + Number(parts[2]);
          }
          return null;
        };
        const loaded: number[] = json.timestamps.map((t: unknown) => parseTs(t)!);
        if (json.words && Array.isArray(json.words)) {
          const loadedWords: string[] = json.words;
          const configFlat = groups.flatMap(g => g.words);
          const configTotal = configFlat.length;
          if (loadedWords.length !== configTotal) {
            alert(
              `Warning: The marker file has ${loadedWords.length} words but your current config has ${configTotal} words.\n\n` +
              `The marker file was saved with a different word setup. ` +
              `Nothing will be loaded — please update your config or marker file so the word counts match, then try again.`
            );
            e.target.value = "";
            return;
          }
        }
        const firstUnmarked = loaded.findIndex((t) => t === null || t === undefined);
        const timingIdx = firstUnmarked === -1 ? loaded.length : firstUnmarked;
        timestampsRef.current = loaded;
        timingIndexRef.current = timingIdx;
        setTimestamps(loaded);
        setTimingIndex(timingIdx);
        lastActiveRef.current = -1;
        lastClearedIdxRef.current = null;
        lastWordHitTimeRef.current = -1;
        setHighlightCleared(false);
        setCurrentIndex(-1);
        if (json.words && Array.isArray(json.words)) {
          const loadedWords: string[] = json.words;
          let hasGroupCounts = false;
          if (json.groupWordCounts && Array.isArray(json.groupWordCounts)) {
            const gwc: number[] = json.groupWordCounts;
            const totalFromGroups = gwc.reduce((a: number, b: number) => a + b, 0);
            if (totalFromGroups === loadedWords.length && gwc.length === groups.length) {
              hasGroupCounts = true;
              let offset = 0;
              const updatedGroups = groups.map((g, gi) => {
                const count = gwc[gi];
                const newWords = loadedWords.slice(offset, offset + count);
                offset += count;
                return { ...g, words: newWords };
              });
              const newFlat = updatedGroups.flatMap(g => g.words);
              setLocalItems(newFlat);
              localItemsLenRef.current = newFlat.length;
              groupsRef.current = updatedGroups;
            }
          }
          if (!hasGroupCounts) {
            setLocalItems(loadedWords);
            localItemsLenRef.current = loadedWords.length;
          }
        }
        if (json.overlays && Array.isArray(json.overlays)) {
          setOverlays(json.overlays.map((ov: any) => ({
            ...ov,
            startTime: typeof ov.startTime === "string" ? parseTs(ov.startTime)! : ov.startTime,
            duration: typeof ov.duration === "string" ? parseTs(ov.duration)! : ov.duration,
          })));
        }
        if (json.groupTransitionTimes) {
          if (Array.isArray(json.groupTransitionTimes)) {
            groupTransitionTimesRef.current = {};
            setGroupTransitionTimes({});
          } else if (typeof json.groupTransitionTimes === "object") {
            const loaded2: Record<number, number[]> = {};
            for (const key of Object.keys(json.groupTransitionTimes)) {
              const times = json.groupTransitionTimes[key];
              if (Array.isArray(times)) {
                loaded2[Number(key)] = (times as unknown[])
                  .map(parseTs)
                  .filter((x): x is number => x != null);
                loaded2[Number(key)].sort((a, b) => a - b);
              }
            }
            groupTransitionTimesRef.current = loaded2;
            setGroupTransitionTimes(loaded2);
          }
        }
        const audioDur = audioRef.current?.duration ?? 0;
        const savedDurRaw = json.audioDuration ?? null;
        const savedDur: number | null = savedDurRaw != null ? (parseTs(savedDurRaw) ?? null) : null;
        if (loaded.length > 0) {
          const validLoaded = loaded.filter((t): t is number => t != null);
          const maxTs = validLoaded.length > 0 ? Math.max(...validLoaded) : 0;
          if (audioDur > 0 && maxTs > audioDur) {
            alert(
              `Warning: This markers file has timestamps up to ${(maxTs / 60).toFixed(1)} min, ` +
              `but the loaded audio is only ${(audioDur / 60).toFixed(1)} min long.\n\n` +
              `These markers were saved with a different audio file. ` +
              `The ${validLoaded.filter((t) => t > audioDur).length} affected word(s) will not highlight during playback — please re-mark them.`
            );
          } else if (audioDur === 0 && savedDur !== null) {
            alert(
              `Note: This markers file was saved with a ${(savedDur / 60).toFixed(1)} min audio file. ` +
              `Make sure you load the same audio before playback, otherwise timestamps may not match.`
            );
          }
        }
      } catch (_err) {
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
    // currentCycleIndex: which cycle are we in right now (0-based)
    // timingIndex=0 → cycle 0 (word 0), timingIndex=46 → cycle 1 (word 0), etc.
    const currentCycleIndex = numWords === 0 ? 0 : Math.floor(timingIndex / numWords);
    const currentCycleOffset = currentCycleIndex * numWords;
    const cycleTimingIndex = timingIndex - currentCycleOffset; // 0..numWords-1
    const numCycles = currentCycleIndex + 1;
    // cycleComplete = we just finished a cycle and are sitting at the start of the next one
    const cycleComplete = cycleTimingIndex === 0 && timingIndex > 0;

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
            Cycle {numCycles - 1} done. Ready for Cycle {numCycles} — seek audio to the next occurrence and press Enter to start marking.
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
                  style={{ color: "#000000", fontSize: "clamp(13px, 1.8vw, 20px)", fontFamily: "'Noto Sans Telugu', 'Noto Serif Telugu', 'Mandali', Georgia, serif" }}>
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
                  ? `Cycle ${numCycles - 1} done. Seek audio to the next occurrence and press Enter to mark Cycle ${numCycles}, or click Done to preview.`
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
                      <Layers className="w-3.5 h-3.5" /> {editingOverlayId ? "Edit" : "Add"} Overlay
                    </span>
                    <button onClick={() => { setAddingOverlay(false); setEditingOverlayId(null); }} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">At</span>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={Math.round(pendingOverlayTime * 10) / 10}
                        onChange={(e) => setPendingOverlayTime(Math.max(0, Number(e.target.value)))}
                        className="w-20 border border-purple-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-purple-400"
                      />
                      <span className="text-xs text-gray-400">({formatTime(pendingOverlayTime)})</span>
                    </div>
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
                        <Check className="w-3.5 h-3.5 mr-1" /> {editingOverlayId ? "Update" : "Save"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setAddingOverlay(false); setEditingOverlayId(null); }} className="text-gray-500 text-xs">Cancel</Button>
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
                      <button onClick={() => editOverlay(ov)} className="ml-auto text-gray-300 hover:text-blue-500 shrink-0"><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => deleteOverlay(ov.id)} className="text-gray-300 hover:text-red-400 shrink-0"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {groups.length > 1 && (
              <div className="flex border-b border-gray-200 px-4 pt-2 gap-1 shrink-0">
                {groups.map((_, tabIdx) => {
                  const tabCurrentGroup = tabIdx === getTimingDisplayGroup(Math.min(cycleTimingIndex, numWords - 1));
                  const tabGroupEnd = groupStartIndices[tabIdx] + groups[tabIdx].words.length;
                  const tabFullyTimed = cycleTimingIndex >= tabGroupEnd;
                  return (
                    <button
                      key={tabIdx}
                      onClick={() => setDisplayGroup(tabIdx)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-t-md border border-b-0 transition-colors ${
                        displayGroup === tabIdx
                          ? "bg-white text-amber-700 border-gray-200"
                          : "bg-gray-50 text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-100"
                      } ${tabCurrentGroup ? "ring-1 ring-amber-300" : ""}`}
                    >
                      Group {tabIdx + 1}
                      {tabFullyTimed && <CheckCircle className="w-3 h-3 ml-1 inline text-green-500" />}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-4" ref={wordListRef}>
              <div className="space-y-4 max-w-lg">
                {groups.map((group, groupIdx) => {
                  if (groups.length > 1 && groupIdx !== displayGroup) return null;
                  const groupStart = groupStartIndices[groupIdx];
                  const isCurrentGroup = groupIdx === getTimingDisplayGroup(Math.min(cycleTimingIndex, numWords - 1));
                  const groupEnd = groupStart + group.words.length;
                  const groupFullyTimed = cycleTimingIndex >= groupEnd;
                  return (
                    <div key={groupIdx}>
                      {groupIdx > 0 && groups.length > 1 && (() => {
                        const transIdx = groupIdx - 1;
                        // Per-transition times — only show chips for this specific transIdx.
                        const transChips = (groupTransitionTimes[transIdx] ?? []) as number[];
                        const isUnmarked = transChips.length === 0;
                        return (
                          <div className={`flex items-center gap-1.5 px-1 mb-2 mt-0.5 ${isUnmarked ? "py-0.5 rounded bg-amber-50 border border-dashed border-amber-300" : ""}`}>
                            <div className="h-px flex-1 bg-gray-200" />
                            <span className={`text-[9px] uppercase tracking-wide font-semibold whitespace-nowrap ${isUnmarked ? "text-amber-600" : "text-gray-400"}`}>display switch</span>
                            {isUnmarked && (
                              <span className="text-[9px] text-amber-500 whitespace-nowrap font-medium">⚠ not marked</span>
                            )}
                            {transChips.map((t) => (
                              <span key={String(t)}
                                className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border"
                                style={{
                                  background: "#f0fdf4",
                                  borderColor: "#86efac",
                                  color: "#15803d",
                                }}
                              >
                                <button
                                  onClick={() => seekToTime(t)}
                                  className="hover:underline focus:outline-none"
                                  title="Seek to this display switch time"
                                  style={{ color: "inherit" }}
                                >
                                  {formatTime(t)}
                                </button>
                                <button
                                  onClick={() => removeGroupTransition(transIdx, t)}
                                  className="ml-0.5 opacity-60 hover:opacity-100 hover:text-red-500 transition-all"
                                  title="Remove this display switch time"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </span>
                            ))}
                            <button
                              onClick={() => markGroupTransition(transIdx)}
                              className={`text-[10px] px-2 py-0.5 rounded border whitespace-nowrap transition-colors ${isUnmarked ? "border-amber-400 text-amber-700 bg-white hover:bg-amber-100 font-semibold" : "border-dashed border-gray-300 text-gray-500 hover:border-amber-400 hover:text-amber-600"}`}
                              title="Mark the current audio time as when this section appears on screen"
                            >
                              Mark
                            </button>
                            <div className="h-px flex-1 bg-gray-200" />
                          </div>
                        );
                      })()}
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
                          const nw = localItems.length;
                          const totalCycles = nw > 0 ? Math.ceil(timestamps.length / nw) : 1;
                          const cycleChips: { cycleIdx: number; t: number }[] = [];
                          for (let k = 0; k < totalCycles; k++) {
                            const flatIdx = k * nw + i;
                            const t = timestamps[flatIdx];
                            if (t !== undefined && t !== null) cycleChips.push({ cycleIdx: k, t });
                          }
                          return (
                            <div
                              key={i}
                              ref={isCurrent ? activeWordRef : undefined}
                              className="group flex flex-col px-3 py-1.5 rounded-lg transition-all"
                              style={{
                                background: isEditing ? "#eff6ff" : isCurrent ? `${highlightColor}18` : "transparent",
                                borderLeft: isEditing ? "3px solid #3b82f6" : isCurrent ? `3px solid ${highlightColor}` : "3px solid transparent",
                              }}
                            >
                              <div className="flex items-center gap-3">
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
                                      style={{ fontFamily: "'Noto Sans Telugu', 'Noto Serif Telugu', 'Mandali', Georgia, serif" }}
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
                                    <span
                                      className="font-serif"
                                      onClick={() => !isCurrent && jumpToWord(i)}
                                      style={{
                                        fontFamily: "'Noto Sans Telugu', 'Noto Serif Telugu', 'Mandali', Georgia, serif",
                                        fontSize: isCurrent ? "20px" : isDone ? "16px" : "14px",
                                        color: isCurrent ? highlightColor : isDone ? "#374151" : "#d1d5db",
                                        fontWeight: isCurrent ? "700" : "400",
                                        cursor: isCurrent ? "default" : "pointer",
                                      }}
                                      title={isCurrent ? undefined : "Click to move cursor here"}
                                    >
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
                              {cycleChips.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-0.5 ml-[60px]">
                                  {cycleChips.map(({ cycleIdx, t }) => {
                                    const isEditing = editingTimestamp?.cycleIdx === cycleIdx && editingTimestamp?.wordIdx === i;
                                    return (
                                      <span
                                        key={cycleIdx}
                                        className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border"
                                        style={{
                                          background: cycleIdx === currentCycleIndex ? `${highlightColor}15` : "#f0fdf4",
                                          borderColor: isEditing ? "#3b82f6" : cycleIdx === currentCycleIndex ? highlightColor : "#86efac",
                                          color: cycleIdx === currentCycleIndex ? highlightColor : "#15803d",
                                        }}
                                      >
                                        {isEditing ? (
                                          <>
                                            <span style={{ color: "inherit" }}>C{cycleIdx + 1}:</span>
                                            <input
                                              autoFocus
                                              value={editingTimestampValue}
                                              onChange={(e) => setEditingTimestampValue(e.target.value)}
                                              onKeyDown={(e) => { if (e.key === "Enter") saveEditTimestamp(); if (e.key === "Escape") setEditingTimestamp(null); }}
                                              onBlur={saveEditTimestamp}
                                              className="bg-transparent border-none outline-none text-[10px] font-mono"
                                              style={{ width: "52px", color: "inherit", padding: 0 }}
                                            />
                                          </>
                                        ) : (
                                          <>
                                            <button
                                              onClick={() => seekToTime(t)}
                                              className="hover:underline focus:outline-none"
                                              title={`Seek to Cycle ${cycleIdx + 1} timestamp`}
                                              style={{ color: "inherit" }}
                                            >
                                              C{cycleIdx + 1}: {formatTime(t)}
                                            </button>
                                            <button
                                              onClick={() => startEditTimestamp(cycleIdx, i, t)}
                                              className="ml-0.5 opacity-60 hover:opacity-100 hover:text-blue-500 transition-all"
                                              title={`Edit Cycle ${cycleIdx + 1} timestamp`}
                                            >
                                              <Pencil className="w-2.5 h-2.5" />
                                            </button>
                                            <button
                                              onClick={() => removeTimestamp(cycleIdx, i)}
                                              className="opacity-60 hover:opacity-100 hover:text-red-500 transition-all"
                                              title={`Remove Cycle ${cycleIdx + 1} timestamp`}
                                            >
                                              <X className="w-2.5 h-2.5" />
                                            </button>
                                          </>
                                        )}
                                      </span>
                                    );
                                  })}
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

            <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
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
                  <div style={{
                    display: "inline-block",
                    border: "2.5px solid #c8a84b",
                    borderRadius: "1rem",
                    padding: "clamp(12px, 1.8vw, 29px) clamp(16px, 2.5vw, 40px)",
                    background: "rgba(255,255,255,0.92)",
                    maxWidth: "90%",
                  }}>
                    <p className="text-center font-semibold leading-tight"
                      style={{
                        fontFamily: "'Noto Sans Telugu', 'Noto Serif Telugu', 'Mandali', Georgia, serif",
                        fontSize: "clamp(28px, 5vw, 64px)",
                        color: overlayTextColor,
                        wordBreak: "break-word",
                        margin: 0,
                      }}>
                      {ov.text}
                    </p>
                  </div>
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
                      style={{ color: slokaColor, fontSize: `${slokaFontSize}px`, fontFamily: "'Noto Sans Telugu', 'Noto Serif Telugu', 'Mandali', Georgia, serif", fontWeight: slokaBold ? "700" : "400", fontStyle: slokaItalic ? "italic" : "normal" }}>
                      {line}
                    </p>
                  ))}
                </div>
              </div>

              <div className="w-full" style={{ height: "6px" }}>
                <svg width="100%" height="6" viewBox="0 0 1000 6" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="glGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#DAA520" stopOpacity="0" />
                      <stop offset="35%" stopColor="#FFD700" stopOpacity="0.9" />
                      <stop offset="50%" stopColor="#FFE87C" stopOpacity="1" />
                      <stop offset="65%" stopColor="#FFD700" stopOpacity="0.9" />
                      <stop offset="100%" stopColor="#DAA520" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M 0 3 Q 500 0 1000 3 Q 500 6 0 3 Z" fill="url(#glGrad)" />
                </svg>
              </div>

              <div ref={wordColsContainerRef} className="flex-1 flex items-start justify-start overflow-y-hidden pb-6"
                style={{ background: "#ffffff", paddingLeft: "16px", paddingRight: "16px", paddingTop: displayGroupWords.length > 9 ? "6px" : "48px" }}>
                {(() => {
                  const wc = displayGroupWords.length;
                  const MAX_COLS = 3;
                  let ROWS_PER_COL = 3;
                  if (wc > MAX_COLS * 3) {
                    ROWS_PER_COL = Math.ceil(wc / MAX_COLS);
                  }
                  const numCols0 = Math.ceil(wc / ROWS_PER_COL);
                  const maxChars = displayGroupWords.reduce((m, w) => Math.max(m, [...w].length), 0);
                  const avgColWidth = numCols0 > 0 ? (100 / numCols0) : 100;
                  const charThreshold = avgColWidth < 30 ? 8 : avgColWidth < 40 ? 10 : 14;
                  let longWordScale = 1;
                  if (maxChars > charThreshold) {
                    longWordScale = Math.max(0.5, charThreshold / maxChars);
                  }
                  const rowScale = ROWS_PER_COL > 3 ? 0.7 : 1;
                  const fontScale = Math.max(0.7, Math.min(rowScale, longWordScale));
                  const scaledPrev = previousFontSize * fontScale;
                  const scaledHL = highlightedFontSize * fontScale;
                  const gapClass = ROWS_PER_COL > 4 ? "gap-4" : ROWS_PER_COL > 3 ? "gap-10" : "gap-24";
                  const numCols = Math.ceil(wc / ROWS_PER_COL);
                  const colWidthPct = numCols > 0 ? `${100 / numCols}%` : "100%";
                  return Array.from({ length: numCols }, (_, colIdx) => {
                    const colItems = displayGroupWords.slice(colIdx * ROWS_PER_COL, (colIdx + 1) * ROWS_PER_COL);
                    return (
                      <div key={`${displayGroup}-${colIdx}`} ref={(el) => { colDivRefs.current[colIdx] = el; }} className={`flex flex-col ${gapClass} shrink-0`}
                        style={{ width: colWidthPct, minWidth: 0 }}>
                        {colItems.map((_, rowIdx) => {
                          const globalIdx = displayGroupStart + colIdx * ROWS_PER_COL + rowIdx;
                          const item = localItems[globalIdx];
                          const activeWordIdx = currentIndex >= 0 && localItems.length > 0 ? currentIndex % localItems.length : -1;
                          const isActive = !highlightCleared && globalIdx === activeWordIdx;
                          const isPast = activeWordIdx >= 0 && (highlightCleared ? globalIdx <= activeWordIdx : globalIdx < activeWordIdx);
                          return (
                            <div key={globalIdx} className="flex items-start select-none"
                              style={{
                                fontSize: isActive ? `${scaledHL}px` : `${scaledPrev}px`,
                                color: isActive ? highlightColor : isPast ? pastWordColor : "transparent",
                                fontFamily: "'Noto Sans Telugu', 'Noto Serif Telugu', 'Mandali', Georgia, serif",
                                lineHeight: 1.3,
                                transform: "scale(1)",
                                transformOrigin: "left top",
                                transition: "font-size 250ms cubic-bezier(0.4,0,0.2,1), color 250ms cubic-bezier(0.4,0,0.2,1)",
                                textShadow: "none",
                                fontWeight: isActive ? "700" : "400",
                                overflowWrap: "normal",
                                wordBreak: "normal",
                                willChange: "transform, color",
                              }}>
                              <span className="inline-block mr-1 shrink-0"
                                style={{ color: highlightColor, opacity: isActive ? 0.85 : 0, minWidth: "0.8em", transition: "opacity 250ms cubic-bezier(0.4,0,0.2,1)", marginTop: "0.15em", fontSize: `${Math.max(10, scaledPrev * 0.7)}px` }}>▶</span>
                              <span style={{ minWidth: 0 }}>{item}</span>
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
