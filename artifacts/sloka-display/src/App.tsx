import { useState } from "react";
import SetupPage, { SetupData } from "@/pages/SetupPage";
import DisplayPage from "@/pages/DisplayPage";

interface SavedDraft {
  slokaText: string;
  wordsText: string;
  audioFile: File | null;
  highlightColor: string;
  highlightedFontSize: number;
  previousFontSize: number;
}

export default function App() {
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [draft, setDraft] = useState<SavedDraft | null>(null);

  const handleStart = (data: SetupData, rawDraft: SavedDraft) => {
    setDraft(rawDraft);
    setSetupData(data);
  };

  const handleBack = () => {
    setSetupData(null);
  };

  if (setupData) {
    return <DisplayPage data={setupData} onBack={handleBack} />;
  }

  return <SetupPage onStart={handleStart} initialDraft={draft} />;
}
