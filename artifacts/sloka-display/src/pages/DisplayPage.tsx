import { useState, useEffect, useRef, useCallback } from "react";
import { SetupData } from "./SetupPage";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Play, Pause, Download, Video, Square } from "lucide-react";

interface DisplayPageProps {
  data: SetupData;
  onBack: () => void;
}

const COLS_PER_COLUMN = 8;

export default function DisplayPage({ data, onBack }: DisplayPageProps) {
  const { slokaLines, items, audioFile, highlightColor, highlightedFontSize, previousFontSize } = data;

  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const displayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (audioFile) {
      const url = URL.createObjectURL(audioFile);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.addEventListener("ended", () => setIsPlaying(false));
      return () => {
        audio.pause();
        URL.revokeObjectURL(url);
      };
    }
  }, [audioFile]);

  const advance = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev < items.length - 1) return prev + 1;
      return prev;
    });
  }, [items.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [advance]);

  const toggleAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  };

  const startRecording = async () => {
    if (!displayRef.current) return;
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { mediaSource: "screen" },
        audio: true,
      });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        setRecordedBlob(blob);
        stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch {
      alert("Screen recording requires permission. Please allow screen capture.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const downloadRecording = () => {
    if (!recordedBlob) return;
    const url = URL.createObjectURL(recordedBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sloka-display.webm";
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetDisplay = () => {
    setCurrentIndex(-1);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };

  const numCols = Math.ceil(items.length / COLS_PER_COLUMN);
  const columns: string[][] = [];
  for (let c = 0; c < numCols; c++) {
    columns.push(items.slice(c * COLS_PER_COLUMN, (c + 1) * COLS_PER_COLUMN));
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col" ref={displayRef}>
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-gray-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Setup
          </Button>
          <span className="text-gray-500 text-xs">|</span>
          <span className="text-gray-400 text-xs">
            {currentIndex < 0 ? "Press Enter to start" : `${currentIndex + 1} / ${items.length}`}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetDisplay}
            className="text-gray-400 hover:text-white text-xs"
          >
            Reset
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {audioFile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleAudio}
              className="text-amber-400 hover:text-amber-300"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span className="ml-1 text-xs">{isPlaying ? "Pause Audio" : "Play Audio"}</span>
            </Button>
          )}

          {!isRecording ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={startRecording}
              className="text-red-400 hover:text-red-300"
            >
              <Video className="w-4 h-4 mr-1" />
              <span className="text-xs">Record</span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={stopRecording}
              className="text-red-500 hover:text-red-400 animate-pulse"
            >
              <Square className="w-4 h-4 mr-1" />
              <span className="text-xs">Stop {formatTime(recordingTime)}</span>
            </Button>
          )}

          {recordedBlob && !isRecording && (
            <Button
              variant="ghost"
              size="sm"
              onClick={downloadRecording}
              className="text-green-400 hover:text-green-300"
            >
              <Download className="w-4 h-4 mr-1" />
              <span className="text-xs">Export MP4</span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div
          className="w-[30%] flex flex-col justify-center items-center border-r border-gray-800 px-6 py-8"
          style={{ background: "linear-gradient(160deg, #1a0a00 0%, #2d1200 100%)" }}
        >
          <div className="text-center space-y-4">
            {slokaLines.map((line, i) => (
              <p
                key={i}
                className="font-serif leading-relaxed"
                style={{
                  color: "#f5deb3",
                  fontSize: "clamp(14px, 2vw, 22px)",
                  textShadow: "0 0 12px rgba(255, 200, 80, 0.4)",
                }}
              >
                {line}
              </p>
            ))}
          </div>
          <div className="mt-8 w-12 h-0.5 bg-amber-700 opacity-50 rounded" />
          <p className="mt-4 text-amber-900 text-xs opacity-60 font-serif italic">
            ఓం శాంతి శాంతి శాంతిః
          </p>
        </div>

        <div className="w-[70%] flex items-start justify-start overflow-x-auto overflow-y-hidden p-6 gap-6"
          style={{ background: "#0f0f0f" }}
        >
          {columns.map((col, colIdx) => (
            <div key={colIdx} className="flex flex-col gap-4 shrink-0">
              {col.map((item, rowIdx) => {
                const globalIdx = colIdx * COLS_PER_COLUMN + rowIdx;
                const isActive = globalIdx === currentIndex;
                const isPast = globalIdx < currentIndex;
                const isFuture = globalIdx > currentIndex;

                return (
                  <div
                    key={globalIdx}
                    className="transition-all duration-500 ease-out select-none"
                    style={{
                      fontSize: isActive
                        ? `${highlightedFontSize}px`
                        : isPast
                        ? `${previousFontSize}px`
                        : `${Math.round(previousFontSize * 0.75)}px`,
                      color: isActive
                        ? highlightColor
                        : isPast
                        ? "rgba(200,180,140,0.75)"
                        : "rgba(80,70,55,0.5)",
                      fontFamily: "'Noto Serif Telugu', Georgia, serif",
                      lineHeight: 1.3,
                      transform: isActive ? "scale(1.08)" : "scale(1)",
                      transformOrigin: "left center",
                      textShadow: isActive
                        ? `0 0 20px ${highlightColor}88, 0 0 40px ${highlightColor}44`
                        : "none",
                      paddingLeft: isActive ? "6px" : "0",
                      fontWeight: isActive ? "700" : isPast ? "500" : "400",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                    onClick={() => setCurrentIndex(globalIdx)}
                    title={`Click to highlight: ${item}`}
                  >
                    {isActive && (
                      <span
                        className="inline-block mr-2 text-sm opacity-80"
                        style={{ color: highlightColor }}
                      >
                        ▶
                      </span>
                    )}
                    {item}
                  </div>
                );
              })}
            </div>
          ))}

          {currentIndex < 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
              <p className="text-amber-500 text-2xl font-serif">Press Enter or click a word to begin</p>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 py-2 bg-gray-900 border-t border-gray-800 flex items-center justify-between">
        <p className="text-gray-600 text-xs">
          Press <kbd className="px-1 py-0.5 bg-gray-700 rounded text-gray-300 text-xs">Enter</kbd> to advance · Click any word to jump
        </p>
        <p className="text-gray-600 text-xs">
          {items.length} {items.length === 1 ? "item" : "items"} · {numCols} {numCols === 1 ? "column" : "columns"}
        </p>
      </div>
    </div>
  );
}
