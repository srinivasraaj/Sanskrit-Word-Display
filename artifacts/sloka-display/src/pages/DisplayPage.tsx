import { useState, useEffect, useRef, useCallback } from "react";
import { SetupData } from "./SetupPage";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Play, Pause, Download, Video, Square, RotateCcw, CheckCircle, Pencil, X, Check } from "lucide-react";

interface DisplayPageProps {
  data: SetupData;
  onBack: () => void;
}

const COLS_PER_COLUMN = 8;
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
    for (let i = timestamps.length - 1; i >= 0; i--) {
      if (t >= timestamps[i]) { active = i; break; }
    }
    setCurrentIndex(active);
    rafRef.current = requestAnimationFrame(tick);
  }, [timestamps]);

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
    if (timingIndex >= localItems.length) return;
    const t = audio.currentTime;
    setTimestamps((prev) => {
      const next = [...prev];
      next[timingIndex] = t;
      return next;
    });
    setTimingIndex((i) => i + 1);
  }, [isPlaying, timingIndex, localItems.length]);

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
    setTimestamps([]);
    setTimingIndex(0);
    setAudioCurrentTime(0);
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
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: true,
        audio: true,
      });
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("video/mp4")
        ? "video/mp4"
        : "video/webm;codecs=vp9";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
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

  const numCols = Math.ceil(localItems.length / COLS_PER_COLUMN);
  const columns: string[][] = [];
  for (let c = 0; c < numCols; c++) {
    columns.push(localItems.slice(c * COLS_PER_COLUMN, (c + 1) * COLS_PER_COLUMN));
  }

  const progress = audioDuration > 0 ? (audioCurrentTime / audioDuration) * 100 : 0;

  if (phase === "timing") {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col text-white">
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack} className="text-gray-400 hover:text-white">
              <ArrowLeft className="w-4 h-4 mr-1" /> Setup
            </Button>
            <span className="text-amber-400 font-semibold text-sm">Step 1: Record Timings</span>
          </div>
          <div className="flex items-center gap-2">
            {timingIndex >= localItems.length && (
              <Button onClick={goToPlayback} size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                <CheckCircle className="w-4 h-4 mr-1" /> Done — Preview
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-[35%] flex flex-col justify-center items-center border-r border-gray-800 px-6 py-8"
            style={{ background: "linear-gradient(160deg, #1a0a00 0%, #2d1200 100%)" }}>
            <div className="text-center space-y-3">
              {slokaLines.map((line, i) => (
                <p key={i} className="font-serif leading-relaxed"
                  style={{ color: "#f5deb3", fontSize: "clamp(13px, 1.8vw, 20px)", textShadow: "0 0 12px rgba(255,200,80,0.4)" }}>
                  {line}
                </p>
              ))}
            </div>
          </div>

          <div className="flex-1 flex flex-col">
            <div className="px-6 pt-5 pb-3 bg-gray-900 border-b border-gray-800">
              <p className="text-gray-300 text-sm mb-3">
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
                <Button onClick={restartTiming} variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                  <RotateCcw className="w-4 h-4 mr-1" /> Restart
                </Button>
                <span className="text-gray-500 text-xs font-mono">{formatTime(audioCurrentTime)}</span>
                <span className="text-gray-600 text-xs">
                  {timingIndex}/{items.length} timed
                </span>
              </div>
              {audioDuration > 0 && (
                <div className="mt-3 h-1.5 bg-gray-700 rounded-full overflow-hidden">
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
                        background: isEditing ? "#1e3a5f" : isCurrent ? `${highlightColor}22` : "transparent",
                        borderLeft: isEditing ? "3px solid #3b82f6" : isCurrent ? `3px solid ${highlightColor}` : "3px solid transparent",
                      }}
                    >
                      <span className="text-xs font-mono w-12 shrink-0"
                        style={{ color: isDone ? "#4ade80" : isCurrent ? highlightColor : "#4b5563" }}>
                        {isDone ? formatTime(timestamps[i]) : isCurrent ? "▶ now" : `#${i + 1}`}
                      </span>

                      {isEditing ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            ref={editInputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="flex-1 bg-gray-800 text-white border border-blue-500 rounded px-2 py-0.5 text-sm outline-none focus:ring-1 focus:ring-blue-400"
                            style={{ fontFamily: "'Noto Serif Telugu', Georgia, serif" }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.stopPropagation(); confirmEdit(); }
                              if (e.key === "Escape") { e.stopPropagation(); cancelEdit(); }
                            }}
                          />
                          <button onClick={confirmEdit} className="text-green-400 hover:text-green-300 p-0.5">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={cancelEdit} className="text-gray-500 hover:text-gray-300 p-0.5">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="font-serif"
                            style={{
                              fontFamily: "'Noto Serif Telugu', Georgia, serif",
                              fontSize: isCurrent ? "20px" : isDone ? "16px" : "14px",
                              color: isCurrent ? highlightColor : isDone ? "#9ca3af" : "#374151",
                              fontWeight: isCurrent ? "700" : "400",
                            }}>
                            {word}
                          </span>
                          <button
                            onClick={() => startEdit(i)}
                            className="ml-auto opacity-0 group-hover:opacity-100 text-gray-600 hover:text-blue-400 transition-opacity p-0.5 shrink-0"
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

            <div className="px-6 py-3 bg-gray-900 border-t border-gray-800">
              <p className="text-gray-600 text-xs">
                Press <kbd className="px-1 py-0.5 bg-gray-700 rounded text-gray-300 text-xs">Enter</kbd> while audio plays to mark each word's start time
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={restartTiming} className="text-gray-400 hover:text-white">
            <ArrowLeft className="w-4 h-4 mr-1" /> Re-time
          </Button>
          <span className="text-amber-400 text-xs font-semibold">Step 2: Preview &amp; Export</span>
          <span className="text-gray-500 text-xs">|</span>
          <span className="text-gray-400 text-xs font-mono">{formatTime(audioCurrentTime)}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={isPlaying ? toggleAudio : startPlayback} variant="ghost" size="sm"
            className="text-amber-400 hover:text-amber-300">
            {isPlaying ? <><Pause className="w-4 h-4 mr-1" /></> : <><Play className="w-4 h-4 mr-1" /></>}
            <span className="text-xs">{isPlaying ? "Pause" : "Play Preview"}</span>
          </Button>

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
        <div className="h-1 bg-gray-800">
          <div className="h-full bg-amber-500 transition-all duration-100"
            style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[30%] flex flex-col justify-center items-center border-r border-gray-800 px-6 py-8"
          style={{ background: "linear-gradient(160deg, #1a0a00 0%, #2d1200 100%)" }}>
          <div className="text-center space-y-4">
            {slokaLines.map((line, i) => (
              <p key={i} className="font-serif leading-relaxed"
                style={{ color: "#f5deb3", fontSize: "clamp(14px, 2vw, 22px)", textShadow: "0 0 12px rgba(255,200,80,0.4)" }}>
                {line}
              </p>
            ))}
          </div>
          <div className="mt-8 w-12 h-0.5 bg-amber-700 opacity-50 rounded" />
          <p className="mt-4 text-amber-900 text-xs opacity-60 font-serif italic">ఓం శాంతి శాంతి శాంతిః</p>
        </div>

        <div className="w-[70%] flex items-start justify-start overflow-x-auto overflow-y-hidden p-6 gap-6"
          style={{ background: "#0f0f0f" }}>
          {columns.map((col, colIdx) => (
            <div key={colIdx} className="flex flex-col gap-4 shrink-0">
              {col.map((item, rowIdx) => {
                const globalIdx = colIdx * COLS_PER_COLUMN + rowIdx;
                const isActive = globalIdx === currentIndex;
                const isPast = globalIdx < currentIndex;
                return (
                  <div key={globalIdx} className="transition-all duration-300 ease-out select-none"
                    style={{
                      fontSize: isActive ? `${highlightedFontSize}px` : isPast ? `${previousFontSize}px` : `${Math.round(previousFontSize * 0.75)}px`,
                      color: isActive ? highlightColor : isPast ? "rgba(200,180,140,0.75)" : "rgba(80,70,55,0.5)",
                      fontFamily: "'Noto Serif Telugu', Georgia, serif",
                      lineHeight: 1.3,
                      transform: isActive ? "scale(1.08)" : "scale(1)",
                      transformOrigin: "left center",
                      textShadow: isActive ? `0 0 20px ${highlightColor}88, 0 0 40px ${highlightColor}44` : "none",
                      paddingLeft: isActive ? "6px" : "0",
                      fontWeight: isActive ? "700" : isPast ? "500" : "400",
                      whiteSpace: "nowrap",
                    }}>
                    {isActive && <span className="inline-block mr-2 text-sm opacity-80" style={{ color: highlightColor }}>▶</span>}
                    {item}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 py-2 bg-gray-900 border-t border-gray-800 flex items-center justify-between">
        <p className="text-gray-600 text-xs">
          {currentIndex >= 0 ? items[currentIndex] : "Waiting for playback…"}
        </p>
        <p className="text-gray-600 text-xs">{items.length} words · {timestamps.length} timestamps recorded</p>
      </div>
    </div>
  );
}
