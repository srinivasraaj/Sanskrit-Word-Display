import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Upload } from "lucide-react";

export interface LineGroup {
  lines: string[];
  words: string[];
}

export interface SetupData {
  groups: LineGroup[];
  audioFile: File | null;
  highlightColor: string;
  slokaColor: string;
  overlayTextColor: string;
  pastWordColor: string;
  highlightedFontSize: number;
  previousFontSize: number;
  slokaFontSize: number;
  slokaBold: boolean;
  slokaItalic: boolean;
}

export interface SavedDraft {
  slokaText: string;
  wordsTexts: string[];
  audioFile: File | null;
  highlightColor: string;
  slokaColor: string;
  overlayTextColor: string;
  pastWordColor: string;
  highlightedFontSize: number;
  previousFontSize: number;
  slokaFontSize: number;
  slokaBold: boolean;
  slokaItalic: boolean;
}

interface SetupPageProps {
  onStart: (data: SetupData, draft: SavedDraft) => void;
  initialDraft?: SavedDraft | null;
}

export default function SetupPage({ onStart, initialDraft }: SetupPageProps) {
  const [slokaText, setSlokaText] = useState(initialDraft?.slokaText ?? "");
  const [wordsTexts, setWordsTexts] = useState<string[]>(initialDraft?.wordsTexts ?? [""]);
  const [audioFile, setAudioFile] = useState<File | null>(initialDraft?.audioFile ?? null);
  const [highlightColor, setHighlightColor] = useState(initialDraft?.highlightColor ?? "#FFD700");
  const [slokaColor, setSlokaColor] = useState(initialDraft?.slokaColor ?? "#000000");
  const [overlayTextColor, setOverlayTextColor] = useState(initialDraft?.overlayTextColor ?? "#1a1a1a");
  const [pastWordColor, setPastWordColor] = useState(initialDraft?.pastWordColor ?? "#000000");
  const [highlightedFontSize, setHighlightedFontSize] = useState(initialDraft?.highlightedFontSize ?? 48);
  const [previousFontSize, setPreviousFontSize] = useState(initialDraft?.previousFontSize ?? 48);
  const [slokaFontSize, setSlokaFontSize] = useState(initialDraft?.slokaFontSize ?? 36);
  const [slokaBold, setSlokaBold] = useState(initialDraft?.slokaBold ?? false);
  const [slokaItalic, setSlokaItalic] = useState(initialDraft?.slokaItalic ?? false);

  const configFileInputRef = useRef<HTMLInputElement>(null);

  const saveConfig = () => {
    const config = {
      version: 1,
      slokaText,
      wordsTexts,
      highlightColor,
      slokaColor,
      overlayTextColor,
      pastWordColor,
      highlightedFontSize,
      previousFontSize,
      slokaFontSize,
      slokaBold,
      slokaItalic,
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sloka-config.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        if (json.slokaText !== undefined) setSlokaText(json.slokaText);
        if (Array.isArray(json.wordsTexts)) setWordsTexts(json.wordsTexts);
        if (json.highlightColor) setHighlightColor(json.highlightColor);
        if (json.slokaColor) setSlokaColor(json.slokaColor);
        if (json.overlayTextColor) setOverlayTextColor(json.overlayTextColor);
        if (json.pastWordColor) setPastWordColor(json.pastWordColor);
        if (json.highlightedFontSize) setHighlightedFontSize(json.highlightedFontSize);
        if (json.previousFontSize) setPreviousFontSize(json.previousFontSize);
        if (json.slokaFontSize) setSlokaFontSize(json.slokaFontSize);
        if (json.slokaBold !== undefined) setSlokaBold(json.slokaBold);
        if (json.slokaItalic !== undefined) setSlokaItalic(json.slokaItalic);
      } catch {
        alert("Could not read config file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const slokaLines = slokaText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const numGroups = Math.max(1, Math.ceil(slokaLines.length / 2));

  useEffect(() => {
    setWordsTexts((prev) => {
      if (prev.length === numGroups) return prev;
      const next = [...prev];
      while (next.length < numGroups) next.push("");
      return next.slice(0, numGroups);
    });
  }, [numGroups]);

  const handleStart = () => {
    const groups: LineGroup[] = wordsTexts
      .map((wt, i) => ({
        lines: slokaLines.slice(i * 2, i * 2 + 2),
        words: wt.split("\n").map((w) => w.trim()).filter((w) => w.length > 0),
      }))
      .filter((g) => g.lines.length > 0 && g.words.length > 0);

    if (groups.length === 0) return;

    const draft: SavedDraft = { slokaText, wordsTexts, audioFile, highlightColor, slokaColor, overlayTextColor, pastWordColor, highlightedFontSize, previousFontSize, slokaFontSize, slokaBold, slokaItalic };
    onStart({ groups, audioFile, highlightColor, slokaColor, overlayTextColor, pastWordColor, highlightedFontSize, previousFontSize, slokaFontSize, slokaBold, slokaItalic }, draft);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center p-6">
      <div className="w-full max-w-3xl space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-amber-900 mb-1">Sanskrit Sloka Display</h1>
          <p className="text-amber-700 text-sm">Configure your sloka and word sequence</p>
        </div>

        <input ref={configFileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={loadConfig} />
        <div className="flex justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => configFileInputRef.current?.click()}
            className="border-amber-300 text-amber-700 hover:bg-amber-50">
            <Upload className="w-4 h-4 mr-1" /> Load Config
          </Button>
          <Button variant="outline" size="sm" onClick={saveConfig}
            className="border-amber-300 text-amber-700 hover:bg-amber-50">
            <Download className="w-4 h-4 mr-1" /> Save Config
          </Button>
        </div>

        <Card className="border-amber-200 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-amber-900 text-lg">Sloka Text</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={slokaText}
              onChange={(e) => setSlokaText(e.target.value)}
              placeholder="Enter each line of the sloka on a new line…"
              className="border-amber-200 text-amber-900 bg-white font-serif min-h-[120px] resize-y"
              style={{ fontFamily: "'Noto Sans Telugu', 'Noto Serif Telugu', 'Mandali', Georgia, serif" }}
            />
            {slokaLines.length > 0 && (
              <p className="text-xs text-amber-600 mt-1">
                {slokaLines.length} line{slokaLines.length !== 1 ? "s" : ""} → {numGroups} group{numGroups !== 1 ? "s" : ""} of 2
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {Array.from({ length: numGroups }, (_, groupIdx) => {
            const groupLines = slokaLines.slice(groupIdx * 2, groupIdx * 2 + 2);
            return (
              <Card key={groupIdx} className="border-amber-200 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-amber-800 text-base">
                    Words for Lines {groupIdx * 2 + 1}–{Math.min(groupIdx * 2 + 2, slokaLines.length)}
                  </CardTitle>
                  {groupLines.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {groupLines.map((line, li) => (
                        <p key={li} className="text-amber-700 text-sm leading-snug"
                          style={{ fontFamily: "'Noto Sans Telugu', 'Noto Serif Telugu', 'Mandali', Georgia, serif" }}>
                          {line}
                        </p>
                      ))}
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={wordsTexts[groupIdx] ?? ""}
                    onChange={(e) => {
                      const updated = [...wordsTexts];
                      updated[groupIdx] = e.target.value;
                      setWordsTexts(updated);
                    }}
                    placeholder="One word or phrase per line…"
                    className="border-amber-200 text-amber-900 bg-white font-serif min-h-[120px] resize-y"
                    style={{ fontFamily: "'Noto Sans Telugu', 'Noto Serif Telugu', 'Mandali', Georgia, serif" }}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-amber-200 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-amber-900 text-lg">Audio (Optional)</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                type="file"
                accept="audio/*"
                onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
                className="border-amber-200 bg-white"
              />
              {audioFile && (
                <p className="text-xs text-amber-700 mt-1">✓ {audioFile.name}</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-amber-200 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-amber-900 text-lg">Display Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Label className="text-xs text-amber-700 w-36">Highlight Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={highlightColor}
                    onChange={(e) => setHighlightColor(e.target.value)}
                    className="w-10 h-8 rounded cursor-pointer border border-amber-200"
                  />
                  <span className="text-sm text-amber-800">{highlightColor}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-xs text-amber-700 w-36">Sloka Text Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={slokaColor}
                    onChange={(e) => setSlokaColor(e.target.value)}
                    className="w-10 h-8 rounded cursor-pointer border border-amber-200"
                  />
                  <span className="text-sm text-amber-800">{slokaColor}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-xs text-amber-700 w-36">Overlay Text Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={overlayTextColor}
                    onChange={(e) => setOverlayTextColor(e.target.value)}
                    className="w-10 h-8 rounded cursor-pointer border border-amber-200"
                  />
                  <span className="text-sm text-amber-800">{overlayTextColor}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-xs text-amber-700 w-36">Past Word Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={pastWordColor}
                    onChange={(e) => setPastWordColor(e.target.value)}
                    className="w-10 h-8 rounded cursor-pointer border border-amber-200"
                  />
                  <span className="text-sm text-amber-800">{pastWordColor}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-xs text-amber-700 w-36">Active Font Size</Label>
                <Input
                  type="number"
                  value={highlightedFontSize}
                  onChange={(e) => setHighlightedFontSize(Number(e.target.value))}
                  className="border-amber-200 bg-white w-24"
                  min={16}
                  max={120}
                />
                <span className="text-xs text-amber-600">px</span>
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-xs text-amber-700 w-36">Previous Font Size</Label>
                <Input
                  type="number"
                  value={previousFontSize}
                  onChange={(e) => setPreviousFontSize(Number(e.target.value))}
                  className="border-amber-200 bg-white w-24"
                  min={10}
                  max={80}
                />
                <span className="text-xs text-amber-600">px</span>
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-xs text-amber-700 w-36">Sloka Text Size</Label>
                <Input
                  type="number"
                  value={slokaFontSize}
                  onChange={(e) => setSlokaFontSize(Number(e.target.value))}
                  className="border-amber-200 bg-white w-24"
                  min={12}
                  max={120}
                />
                <span className="text-xs text-amber-600">px</span>
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-xs text-amber-700 w-36">Sloka Style</Label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSlokaBold((v) => !v)}
                    className={`px-3 py-1 rounded border text-sm font-bold transition-colors ${slokaBold ? "bg-amber-700 text-white border-amber-700" : "bg-white text-amber-700 border-amber-300 hover:border-amber-500"}`}
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onClick={() => setSlokaItalic((v) => !v)}
                    className={`px-3 py-1 rounded border text-sm italic transition-colors ${slokaItalic ? "bg-amber-700 text-white border-amber-700" : "bg-white text-amber-700 border-amber-300 hover:border-amber-500"}`}
                  >
                    I
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="text-center">
          <Button
            onClick={handleStart}
            size="lg"
            className="bg-amber-700 hover:bg-amber-800 text-white px-10 py-3 text-lg font-semibold shadow-md"
          >
            Start Display
          </Button>
          <p className="text-xs text-amber-600 mt-2">Press Enter during display to advance words</p>
        </div>
      </div>
    </div>
  );
}
