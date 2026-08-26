import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MobileContinueBar({
  isContinuing,
  startContinue,
  stopContinue,
  label,
}: {
  isContinuing: boolean;
  startContinue: () => void;
  stopContinue: () => void;
  label: string;
}) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-50 border-t bg-card/95 backdrop-blur px-3 pt-2 pb-[calc(.5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,.12)]">
      <div className="mx-auto w-full max-w-[1600px]">
        <Button
          className="w-full h-12 md:h-14 text-base md:text-lg font-bold justify-between px-4 md:px-6"
          variant={isContinuing ? "destructive" : "default"}
          onClick={isContinuing ? stopContinue : startContinue}
        >
          <span className="flex items-center gap-2">
            {isContinuing ? <Pause className="size-5" /> : <Play className="size-5" />}
            {isContinuing ? "STOP" : "CONTINUE"}
          </span>
          <span className="text-xs md:text-sm font-medium opacity-80">{label}</span>
        </Button>
      </div>
    </div>
  );
}
