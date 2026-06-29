import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly errorMessage: string | undefined;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = {
    errorMessage: undefined,
  };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      errorMessage:
        error instanceof Error ? error.message : "The page failed to render.",
    };
  }

  override componentDidCatch(error: unknown, errorInfo: ErrorInfo): void {
    console.error("Unhandled frontend render error", error, errorInfo);
  }

  override render(): ReactNode {
    if (this.state.errorMessage) {
      return (
        <main className="app-shell">
          <section
            className="status-panel"
            aria-labelledby="render-error-title"
          >
            <h1 id="render-error-title">Mina</h1>
            <p role="alert">{this.state.errorMessage}</p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
