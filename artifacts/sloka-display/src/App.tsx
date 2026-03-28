import { useState } from "react";
import SetupPage, { SetupData } from "@/pages/SetupPage";
import DisplayPage from "@/pages/DisplayPage";

export default function App() {
  const [setupData, setSetupData] = useState<SetupData | null>(null);

  const handleStart = (data: SetupData) => {
    setSetupData(data);
  };

  const handleBack = () => {
    setSetupData(null);
  };

  if (setupData) {
    return <DisplayPage data={setupData} onBack={handleBack} />;
  }

  return <SetupPage onStart={handleStart} />;
}
