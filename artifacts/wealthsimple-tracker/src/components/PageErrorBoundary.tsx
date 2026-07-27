import { Component, type ReactNode } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { reportClientError } from "@/lib/report-error";

interface Props {
  children: ReactNode;
  pageName?: string;
}

interface State {
  error: Error | null;
}

export class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    reportClientError("page-error-boundary", error.message, error.stack, this.props.pageName);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <div className="bg-card border border-card-border rounded-xl p-8 max-w-lg w-full">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
          </div>
          <h2 className="text-lg font-bold mb-2">
            {this.props.pageName
              ? `Erreur sur la page « ${this.props.pageName} »`
              : "Une erreur inattendue s'est produite"}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Un composant a planté lors du rendu. Rechargez la page ou cliquez
            sur « Réessayer » pour relancer la page.
          </p>
          <details className="text-left mb-5">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
              Détail de l'erreur
            </summary>
            <pre className="mt-2 text-xs text-red-500 bg-red-500/5 border border-red-500/20 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
              {error.message}
              {error.stack ? `\n\n${error.stack}` : ""}
            </pre>
          </details>
          <button
            onClick={() => this.setState({ error: null })}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Réessayer
          </button>
        </div>
      </div>
    );
  }
}
