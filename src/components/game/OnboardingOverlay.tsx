import { useEffect, useLayoutEffect, useState } from "react";
import { ArrowLeft, ArrowRight, GraduationCap, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OnboardingChapter } from "@/lib/game/onboarding";

type HighlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function targetRect(selector?: string): HighlightRect | null {
  if (!selector || typeof document === "undefined") return null;
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return null;
  const pad = 7;
  return {
    top: Math.max(6, rect.top - pad),
    left: Math.max(6, rect.left - pad),
    width: Math.min(window.innerWidth - 12, rect.width + pad * 2),
    height: Math.min(window.innerHeight - 12, rect.height + pad * 2),
  };
}

export function OnboardingOverlay({
  chapter,
  onFinish,
  onSkipAll,
}: {
  chapter: OnboardingChapter;
  onFinish: () => void;
  onSkipAll: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [highlight, setHighlight] = useState<HighlightRect | null>(null);
  const step = chapter.steps[Math.min(stepIndex, chapter.steps.length - 1)];
  const finalStep = stepIndex >= chapter.steps.length - 1;

  useEffect(() => {
    setStepIndex(0);
  }, [chapter.id]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useLayoutEffect(() => {
    const refresh = () => setHighlight(targetRect(step.target));
    refresh();
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);
    const timer = window.setTimeout(refresh, 80);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
    };
  }, [step.target, chapter.id, stepIndex]);

  const next = () => {
    if (finalStep) {
      onFinish();
      return;
    }
    setStepIndex((current) => Math.min(chapter.steps.length - 1, current + 1));
  };

  return (
    <div
      className="fixed inset-0 z-[220]"
      role="dialog"
      aria-modal="true"
      aria-label={chapter.title}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {highlight ? (
        <>
          <div
            className="pointer-events-none fixed inset-x-0 top-0 bg-black/70 backdrop-blur-[1px]"
            style={{ height: highlight.top }}
          />
          <div
            className="pointer-events-none fixed left-0 bg-black/70 backdrop-blur-[1px]"
            style={{ top: highlight.top, width: highlight.left, height: highlight.height }}
          />
          <div
            className="pointer-events-none fixed right-0 bg-black/70 backdrop-blur-[1px]"
            style={{
              top: highlight.top,
              left: highlight.left + highlight.width,
              height: highlight.height,
            }}
          />
          <div
            className="pointer-events-none fixed inset-x-0 bottom-0 bg-black/70 backdrop-blur-[1px]"
            style={{ top: highlight.top + highlight.height }}
          />
          <div
            className="pointer-events-none fixed rounded-2xl border-2 border-primary shadow-[0_0_0_2px_rgba(255,255,255,0.08),0_0_28px_rgba(124,58,237,0.35)]"
            style={highlight}
            aria-hidden="true"
          />
        </>
      ) : (
        <div className="pointer-events-none fixed inset-0 bg-black/72 backdrop-blur-[2px]" />
      )}

      <div
        className="fixed inset-0"
        aria-hidden="true"
      />

      <section className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] mx-auto max-w-xl overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-2xl md:bottom-8">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
              <GraduationCap className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                {chapter.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {stepIndex + 1} of {chapter.steps.length}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            onClick={onSkipAll}
            aria-label="Skip all tutorials"
            title="Skip all tutorials"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-5 py-5">
          {step.kicker && (
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
              {step.kicker}
            </p>
          )}
          <h2 className="font-display text-2xl leading-tight">{step.title}</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{step.body}</p>

          <div className="mt-5 flex gap-1.5" aria-label="Tutorial progress">
            {chapter.steps.map((_, index) => (
              <span
                key={index}
                className={
                  "h-1.5 flex-1 rounded-full " +
                  (index <= stepIndex ? "bg-primary" : "bg-muted")
                }
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t bg-muted/20 px-4 py-3">
          <button
            type="button"
            className="mr-auto text-xs font-semibold text-muted-foreground underline-offset-4 hover:underline"
            onClick={onSkipAll}
          >
            Skip all tutorials
          </button>
          {stepIndex > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            >
              <ArrowLeft className="size-4" />
              Back
            </Button>
          )}
          <Button type="button" size="sm" onClick={next}>
            {finalStep ? "Got it" : "Next"}
            {!finalStep && <ArrowRight className="size-4" />}
          </Button>
        </div>
      </section>
    </div>
  );
}
