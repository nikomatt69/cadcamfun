// src/components/ui/ErrorBoundary.tsx
// Enterprise-level Error Boundary with automatic error reporting

import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Mail } from 'react-feather';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  resetKeys?: any[];
  showResetButton?: boolean;
  showHomeButton?: boolean;
  showReportButton?: boolean;
  title?: string;
  description?: string;
  theme?: 'light' | 'dark';
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorId: string;
  isRetrying: boolean;
}

/**
 * Enterprise Error Boundary
 * Provides graceful error handling with user-friendly UI
 * and optional automatic error reporting
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: this.generateErrorId(),
      isRetrying: false,
    };
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({
      error,
      errorInfo,
      errorId: this.generateErrorId(),
    });

    // Log error for monitoring
    this.logError(error, errorInfo);

    // Call custom error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  componentDidUpdate(prevProps: Props): void {
    // Reset error state when resetKeys change
    if (this.props.resetKeys && 
        JSON.stringify(prevProps.resetKeys) !== JSON.stringify(this.props.resetKeys)) {
      this.reset();
    }
  }

  private logError = (error: Error, errorInfo: React.ErrorInfo): void => {
    const { errorId } = this.state;
    
    const errorReport = {
      errorId,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
      viewport: typeof window !== 'undefined' ? {
        width: window.innerWidth,
        height: window.innerHeight,
      } : null,
    };

    // Console log in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', errorReport);
    }

    // In production, you would send to error tracking service
    if (process.env.NODE_ENV === 'production') {
      // Example: send to Sentry, Datadog, etc.
      // this.sendToErrorTracker(errorReport);
    }
  };

  private sendToErrorTracker = async (report: any): Promise<void> => {
    try {
      await fetch('/api/errors/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
    } catch (e) {
      console.error('Failed to send error report:', e);
    }
  };

  private handleReset = (): void => {
    this.reset();
  };

  private reset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      isRetrying: false,
    });
  };

  private handleRetry = async (): Promise<void> => {
    this.setState({ isRetrying: true });
    
    // Small delay to show loading state
    await new Promise(resolve => setTimeout(resolve, 500));
    
    this.reset();
  };

  private handleReport = (): void => {
    const { error, errorId } = this.state;
    const subject = encodeURIComponent(`Error Report: ${errorId}`);
    const body = encodeURIComponent(
      `Error ID: ${errorId}\n\nMessage: ${error?.message}\n\nStack: ${error?.stack}`
    );
    window.location.href = `mailto:support@cadcamfun.com?subject=${subject}&body=${body}`;
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback component
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className={`min-h-screen flex items-center justify-center p-4 ${
          this.props.theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'
        }`}>
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
            {/* Error Icon */}
            <div className="bg-red-50 dark:bg-red-900/20 p-6 text-center">
              <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
            </div>

            {/* Content */}
            <div className="p-6 text-center">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {this.props.title || 'Something went wrong'}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {this.props.description || 'An unexpected error occurred. Please try again or contact support.'}
              </p>
              
              {/* Error ID for reference */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-6">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Error ID: <code className="font-mono text-xs">{this.state.errorId}</code>
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {this.props.showResetButton !== false && (
                  <button
                    onClick={this.handleRetry}
                    disabled={this.state.isRetrying}
                    className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {this.state.isRetrying ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Retrying...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Try Again
                      </>
                    )}
                  </button>
                )}

                {this.props.showHomeButton !== false && (
                  <button
                    onClick={() => window.location.href = '/'}
                    className="inline-flex items-center justify-center px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
                  >
                    <Home className="w-4 h-4 mr-2" />
                    Go Home
                  </button>
                )}

                {this.props.showReportButton !== false && (
                  <button
                    onClick={this.handleReport}
                    className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Report
                  </button>
                )}
              </div>
            </div>

            {/* Stack trace in development */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900">
                <details>
                  <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                    Technical Details
                  </summary>
                  <pre className="mt-2 text-xs text-red-600 dark:text-red-400 overflow-auto max-h-48">
                    {this.state.error.stack}
                  </pre>
                </details>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook for functional components to access error boundary state
 */
export const useErrorHandler = () => {
  const [error, setError] = React.useState<Error | null>(null);

  const handleError = React.useCallback((err: Error) => {
    console.error('Error caught by hook:', err);
    setError(err);
  }, []);

  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  return { handleError, clearError: () => setError(null) };
};

export default ErrorBoundary;
