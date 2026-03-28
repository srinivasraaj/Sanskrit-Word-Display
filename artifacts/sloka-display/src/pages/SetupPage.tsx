import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface SetupData {
  slokaLines: [string, string, string, string];
  items: string[];
  audioFile: File | null;
  highlightColor: string;
  highlightedFontSize: number;
  previousFontSize: number;
}

interface SetupPageProps {
  onStart: (data: SetupData) => void;
}

export default function SetupPage({ onStart }: SetupPageProps) {
  const [slokaLine1, setSlokaLine1] = useState("ఓం సహ నావవతు।");
  const [slokaLine2, setSlokaLine2] = useState("సహ నౌ భునక్తు।");
  const [slokaLine3, setSlokaLine3] = useState("సహ వీర్యం కరవావహై।");
  const [slokaLine4, setSlokaLine4] = useState("తేజస్వినావధీతమస్తు మా విద్విషావహై।");
  const [wordsText, setWordsText] = useState(
    "ఓం\nసహ\nనావవతు\nసహ\nనౌ\nభునక్తు\nసహ\nవీర్యం\nకరవావహై"
  );
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [highlightColor, setHighlightColor] = useState("#FFD700");
  const [highlightedFontSize, setHighlightedFontSize] = useState(48);
  const [previousFontSize, setPreviousFontSize] = useState(24);

  const handleStart = () => {
    const items = wordsText
      .split("\n")
      .map((w) => w.trim())
      .filter((w) => w.length > 0);
    if (items.length === 0) return;
    onStart({
      slokaLines: [slokaLine1, slokaLine2, slokaLine3, slokaLine4],
      items,
      audioFile,
      highlightColor,
      highlightedFontSize,
      previousFontSize,
    });
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
              <CardTitle className="text-amber-900 text-lg">Sanskrit Sloka (4 Lines)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { val: slokaLine1, set: setSlokaLine1, label: "Line 1" },
                { val: slokaLine2, set: setSlokaLine2, label: "Line 2" },
                { val: slokaLine3, set: setSlokaLine3, label: "Line 3" },
                { val: slokaLine4, set: setSlokaLine4, label: "Line 4" },
              ].map(({ val, set, label }) => (
                <div key={label}>
                  <Input
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    className="border-amber-200 text-amber-900 bg-white font-serif"
                  />
                </div>
              ))}
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
