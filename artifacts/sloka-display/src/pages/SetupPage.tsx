import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface SetupData {
  slokaLines: string[];
  items: string[];
  audioFile: File | null;
  highlightColor: string;
  highlightedFontSize: number;
  previousFontSize: number;
}

interface SavedDraft {
  slokaText: string;
  wordsText: string;
  audioFile: File | null;
  highlightColor: string;
  highlightedFontSize: number;
  previousFontSize: number;
}

interface SetupPageProps {
  onStart: (data: SetupData, draft: SavedDraft) => void;
  initialDraft?: SavedDraft | null;
}

export default function SetupPage({ onStart, initialDraft }: SetupPageProps) {
  const [slokaText, setSlokaText] = useState(initialDraft?.slokaText ?? "");
  const [wordsText, setWordsText] = useState(initialDraft?.wordsText ?? "");
  const [audioFile, setAudioFile] = useState<File | null>(initialDraft?.audioFile ?? null);
  const [highlightColor, setHighlightColor] = useState(initialDraft?.highlightColor ?? "#FFD700");
  const [highlightedFontSize, setHighlightedFontSize] = useState(initialDraft?.highlightedFontSize ?? 48);
  const [previousFontSize, setPreviousFontSize] = useState(initialDraft?.previousFontSize ?? 24);

  const handleStart = () => {
    const slokaLines = slokaText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const items = wordsText
      .split("\n")
      .map((w) => w.trim())
      .filter((w) => w.length > 0);
    if (items.length === 0) return;
    const draft: SavedDraft = { slokaText, wordsText, audioFile, highlightColor, highlightedFontSize, previousFontSize };
    onStart({ slokaLines, items, audioFile, highlightColor, highlightedFontSize, previousFontSize }, draft);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center p-6">
      <div className="w-full max-w-3xl space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-amber-900 mb-1">Sanskrit Sloka Display</h1>
          <p className="text-amber-700 text-sm">Configure your sloka and word sequence</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-amber-200 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-amber-900 text-lg">Sloka</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={slokaText}
                onChange={(e) => setSlokaText(e.target.value)}
                className="border-amber-200 text-amber-900 bg-white font-serif min-h-[180px] resize-y"
              />
            </CardContent>
          </Card>

          <Card className="border-amber-200 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-amber-900 text-lg">Words / Sentences</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={wordsText}
                onChange={(e) => setWordsText(e.target.value)}
                className="border-amber-200 text-amber-900 bg-white font-serif min-h-[180px] resize-y"
              />
            </CardContent>
          </Card>
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
