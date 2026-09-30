import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Top-level render-error safety net.
 *
 * Without this, a single throwing component (e.g. Chat props computed from a
 * not-yet-selected conversation) unmounts the ENTIRE React tree: white screen,
 * socket singleton disconnect, "Node cannot be found in the current page" from
 * portal teardown. The boundary contains the failure to a recoverable screen
 * and keeps the surrounding providers (socket, push, theme) alive.
 */
type Props = { children: ReactNode };
type State = { error: Error | null };

class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep a breadcrumb in the console for production debugging.
    console.error("[AppErrorBoundary]", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500/15 to-violet-500/15 flex items-center justify-center">
            <span className="text-2xl">⚠️</span>
          </div>
          <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            The page hit an unexpected error while rendering. Reloading usually fixes it —
            your conversation and unsent drafts stay safe.
          </p>
          {error?.message ? (
            <pre className="text-xs text-muted-foreground/70 bg-muted rounded-lg p-3 overflow-auto text-left">
              {error.message}
            </pre>
          ) : null}
          <Button onClick={this.handleReload}>Reload app</Button>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
