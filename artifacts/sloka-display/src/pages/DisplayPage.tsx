import { useState, useEffect, useRef, useCallback } from "react";
import { SetupData } from "./SetupPage";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Play, Pause, Download, Video, Square, RotateCcw, CheckCircle, Pencil, X, Check, Upload } from "lucide-react";

interface DisplayPageProps {
  data: SetupData;
  onBack: () => void;
}

type Phase = "timing" | "playback";

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
  const markersFileInputRef = useRef<HTMLInputElement>(null);

  const getTimingDisplayGroup = (idx: number) => {
    let g = 0;
    for (let i = groupStartIndices.length - 1; i >= 0; i--) {
      if (idx >= groupStartIndices[i]) { g = i; break; }
    }
    return g;
  };

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { localItemsLenRef.current = localItems.length; }, [localItems.length]);

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
        const duration = audio.duration;
        const next = [...timestampsRef.current];
        const startIdx = timingIndexRef.current;
        for (let i = startIdx; i < localItemsLenRef.current; i++) {
          if (next[i] === undefined || next[i] === null) next[i] = duration;
        }
        timestampsRef.current = next;
        timingIndexRef.current = localItemsLenRef.current;
        setTimestamps([...next]);
        setTimingIndex(localItemsLenRef.current);
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
    if (t > 0) {
      const ts = timestampsRef.current;
      const ahead = t + playbackOffsetRef.current;
      for (let i = ts.length - 1; i >= 0; i--) {
        if (ahead >= ts[i]) { active = i; break; }
      }
    }
    if (active !== lastActiveRef.current) {
      lastActiveRef.current = active;
      setCurrentIndex(active);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (activeWordRef.current) {
      activeWordRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [timingIndex]);

  useEffect(() => {
    if (audioEndedInTimingRef.current && timingIndex >= localItems.length) {
      audioEndedInTimingRef.current = false;
      setTimeout(() => goToPlayback(), 600);
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
    let g = 0;
    for (let i = groupStartIndices.length - 1; i >= 0; i--) {
      if (currentIndex >= groupStartIndices[i]) { g = i; break; }
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
      audio.play();
      setIsPlaying(true);
      if (phase === "playback") rafRef.current = requestAnimationFrame(tick);
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
    const idx = timingIndexRef.current;
    if (idx >= localItems.length) return;
    const t = Math.max(0, audio.currentTime - 1);
    const next = [...timestampsRef.current];
    next[idx] = t;
    timestampsRef.current = next;
    timingIndexRef.current = idx + 1;
    setTimestamps(next);
    setTimingIndex(idx + 1);
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
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.currentTime = 0; }
    setIsPlaying(false);
    setCurrentIndex(-1);
    setAudioCurrentTime(0);
    setDisplayGroup(0);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
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

  const restartTiming = () => {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.currentTime = 0; }
    setIsPlaying(false);
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
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
    setCurrentIndex(-1);
    setDisplayGroup(0);
    audio.play();
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
      const screenStream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: true,
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: "include",
      });
      const audioEl = audioRef.current as any;
      const audioStream: MediaStream | null =
        typeof audioEl?.captureStream === "function" ? audioEl.captureStream() : null;
      const combinedTracks = [
        ...screenStream.getVideoTracks(),
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
        screenStream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      };

      const videoTrack = screenStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.addEventListener("ended", () => {
          stopAndSaveRecording();
        });
      }

      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      lastActiveRef.current = -1;
      setCurrentIndex(-1);
      setDisplayGroup(0);
      setAudioCurrentTime(0);
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = window.setInterval(() => setRecordingTime((t) => t + 1), 1000);
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      setTimeout(() => startPlayback(), 500);
    } catch {
      alert("Allow screen sharing to record. Then recording will auto-start playback.");
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

  const downloadMarkers = () => {
    const payload = {
      words: localItems,
      timestamps,
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
        timestampsRef.current = loaded;
        timingIndexRef.current = loaded.length;
        setTimestamps(loaded);
        setTimingIndex(loaded.length);
        if (json.words && Array.isArray(json.words)) {
          setLocalItems(json.words);
          localItemsLenRef.current = json.words.length;
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
    const timingGroup = getTimingDisplayGroup(timingIndex);
    const timingGroupLines = groups[timingGroup]?.lines ?? [];

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
            {timingIndex >= localItems.length && (
              <Button onClick={goToPlayback} size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                <CheckCircle className="w-4 h-4 mr-1" /> Done — Preview
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex flex-col items-center justify-center border-b border-amber-100 px-6 py-4"
            style={{ background: "linear-gradient(160deg, #fef9f0 0%, #fdf3e7 100%)" }}>
            {groups.length > 1 && (
              <p className="text-xs text-amber-500 mb-1 font-medium">
                Group {timingGroup + 1} of {groups.length}
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
                  : timingIndex < localItems.length
                  ? `Play audio → press  Enter  when you hear "${localItems[timingIndex]}"`
                  : "All words timed! Click Done to preview."}
              </p>
              <input
                ref={markersFileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={uploadMarkers}
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
                <span className="text-gray-400 text-xs font-mono">{formatTime(audioCurrentTime)}</span>
                <span className="text-gray-400 text-xs">
                  {timingIndex}/{localItems.length} timed
                </span>
              </div>
              {audioDuration > 0 && (
                <div className="mt-3 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full transition-all duration-100"
                    style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6" ref={wordListRef}>
              <div className="space-y-4 max-w-lg">
                {groups.map((group, groupIdx) => {
                  const groupStart = groupStartIndices[groupIdx];
                  const isCurrentGroup = groupIdx === getTimingDisplayGroup(timingIndex);
                  return (
                    <div key={groupIdx}>
                      <div className={`text-xs font-semibold mb-1 px-1 ${isCurrentGroup ? "text-amber-700" : "text-gray-400"}`}>
                        Lines {groupIdx * 2 + 1}–{Math.min(groupIdx * 2 + 2, groups.flatMap(g => g.lines).length)}
                      </div>
                      <div className="space-y-1">
                        {group.words.map((_, wordIdx) => {
                          const i = groupStart + wordIdx;
                          const word = localItems[i];
                          const isCurrent = i === timingIndex;
                          const isDone = i < timingIndex;
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
                                {isDone ? formatTime(timestamps[i]) : isCurrent ? "▶ now" : `#${i + 1}`}
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
      {!isRecording && (
        <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={restartTiming} className="text-gray-500 hover:text-gray-800">
              <ArrowLeft className="w-4 h-4 mr-1" /> Re-time
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
        <div className="h-1 bg-gray-200">
          <div className="h-full bg-amber-500 transition-all duration-100"
            style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="flex flex-col flex-1 overflow-hidden">
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

        <div className="w-full" style={{ height: "1px", background: "linear-gradient(to right, transparent 0%, rgba(180,160,120,0.35) 20%, rgba(160,130,80,0.55) 50%, rgba(180,160,120,0.35) 80%, transparent 100%)" }} />

        <div className="flex-1 flex items-start justify-start overflow-x-auto overflow-y-hidden pt-12 pb-6 gap-8"
          style={{ background: "#ffffff", paddingLeft: "16px", paddingRight: "16px" }}>
          {(() => {
            const ROWS_PER_COL = 3;
            const numCols = Math.ceil(displayGroupWords.length / ROWS_PER_COL);
            return Array.from({ length: numCols }, (_, colIdx) => {
              const colItems = displayGroupWords.slice(colIdx * ROWS_PER_COL, (colIdx + 1) * ROWS_PER_COL);
              return (
                <div key={`${displayGroup}-${colIdx}`} className="flex flex-col gap-3 shrink-0">
                  {colItems.map((_, rowIdx) => {
                    const globalIdx = displayGroupStart + colIdx * ROWS_PER_COL + rowIdx;
                    const item = localItems[globalIdx];
                    const isActive = globalIdx === currentIndex;
                    const isPast = globalIdx < currentIndex;
                    return (
                      <div key={globalIdx} className="flex items-center select-none"
                        style={{
                          fontSize: `${previousFontSize}px`,
                          color: isActive ? highlightColor : isPast ? "rgba(100,60,10,0.7)" : "transparent",
                          fontFamily: "'Mandali', 'Noto Sans Telugu', Georgia, serif",
                          lineHeight: 1.3,
                          transform: isActive ? "scale(1.3)" : "scale(1)",
                          transformOrigin: "left center",
                          transition: "transform 150ms ease-out",
                          textShadow: "none",
                          fontWeight: isActive ? "700" : isPast ? "500" : "400",
                          whiteSpace: "nowrap",
                          willChange: "transform",
                          contain: "layout style",
                        }}>
                        <span className="inline-block mr-1 text-sm"
                          style={{ color: highlightColor, opacity: isActive ? 0.85 : 0, minWidth: "1em" }}>▶</span>
                        {item}
                      </div>
                    );
                  })}
                </div>
              );
            });
          })()}
        </div>
      </div>

      {!isRecording && (
        <div className="px-4 py-2 bg-white border-t border-gray-200 flex items-center justify-between">
          <p className="text-gray-400 text-xs">
            {currentIndex >= 0 ? localItems[currentIndex] : "Waiting for playback…"}
          </p>
          <p className="text-gray-400 text-xs">{localItems.length} words · {timestamps.length} timestamps recorded</p>
        </div>
      )}
    </div>
  );
}
