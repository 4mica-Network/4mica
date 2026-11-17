import { Component, type ErrorInfo, type ReactNode } from "react";
import { isChunkLoadError, reloadForNewVersion } from "@/lib/chunkReload";
import { reportError } from "@/lib/reportError";

export interface FallbackProps {
  error: Error;
  reset: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: (props: FallbackProps) => ReactNode;
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    if (
      isChunkLoadError(error) &&
      (!navigator.onLine || reloadForNewVersion())
    ) {
      return;
    }
    reportError(error);
  }

  componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    return error
      ? this.props.fallback({ error, reset: this.reset })
      : this.props.children;
  }
}
