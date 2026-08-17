import { Component, type ErrorInfo, type ReactNode } from "react";

/* Lightweight defensive boundary around a single screen.
 *
 * A malformed domain slice should degrade to one broken panel, not a blank
 * game. The error is re-reported to the console verbatim — nothing is
 * swallowed, so genuine state corruption stays visible in diagnostics.
 */
export class ScreenBoundary extends Component<
  { name: string; children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[screen:${this.props.name}]`, error, info.componentStack);
  }

  componentDidUpdate(prev: { name: string }) {
    if (prev.name !== this.props.name && this.state.error) this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return (
        <section className="rounded-xl border bg-card shadow-sm overflow-hidden mb-4">
          <div className="banner-strip px-3 py-2 text-xs">{this.props.name} — unavailable</div>
          <div className="p-4 space-y-2 text-sm">
            <p className="text-muted-foreground">
              This screen could not be rendered. Your save is untouched — other screens still work.
            </p>
            <pre className="text-xs whitespace-pre-wrap text-[color:var(--color-expense)]">
              {this.state.error.message}
            </pre>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}
