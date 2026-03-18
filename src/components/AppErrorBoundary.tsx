import { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message ?? 'אירעה שגיאה לא צפויה',
    };
  }

  componentDidCatch(error: Error, errorInfo: unknown) {
    console.error('Application runtime error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-xl">
          <Alert variant="destructive" className="space-y-3">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>ERROR - אירעה שגיאה במערכת</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>המערכת נתקלה בשגיאה בלתי צפויה.</p>
              <p><strong>סיבת ההתראה:</strong> {this.state.errorMessage}</p>
              <Button variant="outline" onClick={this.handleReload}>רענון הדף</Button>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }
}
