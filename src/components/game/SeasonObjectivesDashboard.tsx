import { BadgePoundSterling, Building2, ClipboardList, Trophy, UsersRound, WalletCards } from "lucide-react";

const OBJECTIVE_ICONS = [Trophy, WalletCards, BadgePoundSterling, UsersRound, Building2, ClipboardList];

export type SeasonObjectiveCard = {
  id: string;
  title: string;
  detail?: string;
  progress?: string;
  progressTone?: "track" | "behind";
};

export function SeasonObjectivesDashboard({
  objectives,
  footer,
}: {
  objectives: SeasonObjectiveCard[];
  footer?: string;
}) {
  return (
    <section className="lf-objectives">
      <div className="lf-objectives-heading">
        <span>Season objectives</span>
        <small>{objectives.length} objectives</small>
      </div>
      <div className="lf-objective-grid">
        {objectives.map((objective, index) => {
          const Icon = OBJECTIVE_ICONS[index % OBJECTIVE_ICONS.length];
          return (
            <div className="lf-objective-card" key={objective.id}>
              <Icon />
              <div>
                <strong>{objective.title}</strong>
                {objective.detail && <p>{objective.detail}</p>}
                {objective.progress && (
                  <span className={`lf-objective-progress ${objective.progressTone === "track" ? "is-track" : "is-behind"}`}>
                    {objective.progress}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {footer && <div className="lf-objectives-review">{footer}</div>}
    </section>
  );
}
