import { useState, useEffect, useRef, useCallback } from "react";
import { SetupData } from "./SetupPage";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Play, Pause, Download, Video, Square, RotateCcw, CheckCircle, Pencil, X, Check } from "lucide-react";

interface DisplayPageProps {
  data: SetupData;
  onBack: () => void;
}

type Phase = "timing" | "playback";

export default function DisplayPage({ data, onBack }: DisplayPageProps) {
  const { slokaLines, items, audioFile, highlightColor, highlightedFontSize, previousFontSize } = data;

  const [phase, setPhase] = useState<Phase>("timing");
  const [localItems, setLocalItems] = useState<string[]>([...items]);
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

  useEffect(() => {
    if (!audioFile) return;
    const url = URL.createObjectURL(audioFile);
    const audio = new Audio(url);
    audio.addEventListener("loadedmetadata", () => setAudioDuration(audio.duration));
    audio.addEventListener("ended", () => {
      setIsPlaying(false);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
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
    setAudioCurrentTime(t);
    let active = -1;
    if (t > 0) {
      const ts = timestampsRef.current;
      const ahead = t + playbackOffsetRef.current;
      for (let i = ts.length - 1; i >= 0; i--) {
        if (ahead >= ts[i]) { active = i; break; }
      }
    }
    setCurrentIndex(active);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (activeWordRef.current) {
      activeWordRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
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
    const t = audio.currentTime;
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
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setPhase("playback");
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
    setPhase("timing");
  };

  const startPlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setCurrentIndex(-1);
    audio.play();
    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  };

  const startRecording = async () => {
    try {
      const screenStream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: true,
        audio: false,
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
      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = window.setInterval(() => setRecordingTime((t) => t + 1), 1000);
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

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toFixed(1).padStart(4, "0");
    return `${m}:${sec}`;
  };

  const progress = audioDuration > 0 ? (audioCurrentTime / audioDuration) * 100 : 0;

  if (phase === "timing") {
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
            <div className="flex flex-col items-center gap-y-1">
              {slokaLines.map((line, i) => (
                <p key={i} className="font-serif leading-relaxed text-center"
                  style={{ color: "#7c3f0a", fontSize: "clamp(13px, 1.8vw, 20px)", textShadow: "0 0 8px rgba(150,80,0,0.12)" }}>
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
                  {timingIndex}/{items.length} timed
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
              <div className="space-y-1 max-w-lg">
                {localItems.map((word, i) => {
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
                            style={{ fontFamily: "'Noto Serif Telugu', Georgia, serif" }}
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
                              fontFamily: "'Noto Serif Telugu', Georgia, serif",
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={restartTiming} className="text-gray-500 hover:text-gray-800">
            <ArrowLeft className="w-4 h-4 mr-1" /> Re-time
          </Button>
          <span className="text-amber-700 text-xs font-semibold">Step 2: Preview &amp; Export</span>
          <span className="text-gray-300 text-xs">|</span>
          <span className="text-gray-500 text-xs font-mono">{formatTime(audioCurrentTime)}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={isPlaying ? toggleAudio : startPlayback} variant="ghost" size="sm"
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

          {!isRecording ? (
            <Button variant="ghost" size="sm" onClick={startRecording} className="text-red-400 hover:text-red-300">
              <Video className="w-4 h-4 mr-1" />
              <span className="text-xs">Record &amp; Export</span>
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={stopRecording}
              className="text-red-500 hover:text-red-400 animate-pulse">
              <Square className="w-4 h-4 mr-1" />
              <span className="text-xs">Stop {Math.floor(recordingTime / 60).toString().padStart(2, "0")}:{(recordingTime % 60).toString().padStart(2, "0")}</span>
            </Button>
          )}

          {recordedBlob && !isRecording && (
            <Button variant="ghost" size="sm" onClick={downloadRecording} className="text-green-400 hover:text-green-300">
              <Download className="w-4 h-4 mr-1" />
              <span className="text-xs">Download</span>
            </Button>
          )}
        </div>
      </div>

      {audioDuration > 0 && (
        <div className="h-1 bg-gray-200">
          <div className="h-full bg-amber-500 transition-all duration-100"
            style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex flex-col items-center justify-center border-b border-amber-100 px-6 py-4"
          style={{ background: "linear-gradient(160deg, #fef9f0 0%, #fdf3e7 100%)" }}>
          <div className="flex flex-col items-center gap-y-1">
            {slokaLines.map((line, i) => (
              <p key={i} className="font-serif leading-relaxed text-center"
                style={{ color: "#7c3f0a", fontSize: "clamp(14px, 2vw, 22px)", textShadow: "0 0 8px rgba(150,80,0,0.12)" }}>
                {line}
              </p>
            ))}
          </div>
          <p className="mt-2 text-amber-600 text-xs opacity-50 font-serif italic">ఓం శాంతి శాంతి శాంతిః</p>
        </div>

        <div className="flex-1 flex items-start justify-start overflow-x-auto overflow-y-hidden px-6 py-6 gap-8"
          style={{ background: "#fafafa" }}>
          {(() => {
            const ROWS_PER_COL = 8;
            const numCols = Math.ceil(localItems.length / ROWS_PER_COL);
            return Array.from({ length: numCols }, (_, colIdx) => {
              const colItems = localItems.slice(colIdx * ROWS_PER_COL, (colIdx + 1) * ROWS_PER_COL);
              return (
                <div key={colIdx} className="flex flex-col gap-3 shrink-0">
                  {colItems.map((item, rowIdx) => {
                    const globalIdx = colIdx * ROWS_PER_COL + rowIdx;
                    const isActive = globalIdx === currentIndex;
                    const isPast = globalIdx < currentIndex;
                    return (
                      <div key={globalIdx} className="transition-all duration-300 ease-out select-none"
                        style={{
                          fontSize: isActive ? `${highlightedFontSize}px` : isPast ? `${previousFontSize}px` : `${Math.round(previousFontSize * 0.75)}px`,
                          color: isActive ? highlightColor : isPast ? "rgba(100,60,10,0.7)" : "transparent",
                          fontFamily: "'Noto Serif Telugu', Georgia, serif",
                          lineHeight: 1.3,
                          transform: isActive ? "scale(1.06)" : "scale(1)",
                          transformOrigin: "left center",
                          textShadow: isActive ? `0 0 16px ${highlightColor}66, 0 0 32px ${highlightColor}33` : "none",
                          paddingLeft: isActive ? "6px" : "0",
                          fontWeight: isActive ? "700" : isPast ? "500" : "400",
                          whiteSpace: "nowrap",
                        }}>
                        {isActive && <span className="inline-block mr-1 text-sm opacity-80" style={{ color: highlightColor }}>▶</span>}
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

      <div className="px-4 py-2 bg-white border-t border-gray-200 flex items-center justify-between">
        <p className="text-gray-400 text-xs">
          {currentIndex >= 0 ? localItems[currentIndex] : "Waiting for playback…"}
        </p>
        <p className="text-gray-400 text-xs">{localItems.length} words · {timestamps.length} timestamps recorded</p>
      </div>
    </div>
  );
}
