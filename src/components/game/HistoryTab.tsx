export function History({ state }: { state: GameState }) {
  const rows = [...state.ledger].reverse();
  return (
    <Section title="Weekly ledger">
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No entries yet. Advance a week to begin recording finances.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tnum">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-2 pr-3">Week</th>
                <th className="text-left py-2 pr-3">Note</th>
                <th className="text-right py-2 pr-3">Income</th>
                <th className="text-right py-2 pr-3">Expenses</th>
                <th className="text-right py-2 pr-3">Net</th>
                <th className="text-right py-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l, i) => {
                const inc = sum(l.income);
                const exp = sum(l.expenses);
                return (
                  <tr key={i} className="border-b last:border-b-0">
                    <td className="py-1.5 pr-3 text-muted-foreground">
                      S{l.season} W{l.week}
                    </td>
                    <td className="py-1.5 pr-3">
                      {l.matchdayNote ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="text-right py-1.5 pr-3 text-[color:var(--color-income)]">
                      {fmtMoneyExact(inc)}
                    </td>
                    <td className="text-right py-1.5 pr-3 text-[color:var(--color-expense)]">
                      {fmtMoneyExact(exp)}
                    </td>
                    <td
                      className={cn(
                        "text-right py-1.5 pr-3 font-semibold",
                        l.net >= 0
                          ? "text-[color:var(--color-income)]"
                          : "text-[color:var(--color-expense)]",
                      )}
                    >
                      {fmtMoneyExact(l.net)}
                    </td>
                    <td className="text-right py-1.5">{fmtMoneyExact(l.balance)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
