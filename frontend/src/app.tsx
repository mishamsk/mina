import { AlertCircle } from "lucide-react";
import { BrowserRouter } from "react-router";

import { ErrorBoundary } from "./components/error-boundary";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { AppRoutes } from "./pages/router";
import { useBootstrapView } from "./store/bootstrap";

export const App = () => {
  const { errorMessage, status } = useBootstrapView();

  if (status === "failed") {
    return (
      <main className="bg-background text-foreground min-h-svh px-5 py-8 sm:px-8">
        <section
          className="mx-auto w-full max-w-5xl"
          aria-labelledby="bootstrap-error-title"
        >
          <Card className="border-destructive/30 bg-destructive/5 max-w-xl">
            <CardHeader>
              <CardTitle
                id="bootstrap-error-title"
                className="text-destructive flex items-center gap-2"
              >
                <AlertCircle className="size-4" aria-hidden="true" />
                Mina
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-destructive text-sm" role="alert">
                {errorMessage ?? "Browser state failed to load."}
              </p>
            </CardContent>
          </Card>
        </section>
      </main>
    );
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export const BootstrapSplash = () => (
  <main
    className="bg-background text-foreground min-h-svh px-5 py-8 sm:px-8"
    aria-busy="true"
  >
    <section
      className="mx-auto w-full max-w-5xl"
      aria-labelledby="bootstrap-title"
    >
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle id="bootstrap-title">Mina</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Loading browser state...
          </p>
        </CardContent>
      </Card>
    </section>
  </main>
);
