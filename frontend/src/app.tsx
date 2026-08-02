import { AlertCircle } from "lucide-react";
import { useEffect } from "react";
import { BrowserRouter } from "react-router";

import { ErrorBoundary } from "./components/error-boundary";
import { AppTooltipProvider } from "./components/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { LoginScreen } from "./features/authentication";
import { AppRoutes } from "./pages/router";
import { useAuthenticationView } from "./store/authentication";
import { useBootstrapView } from "./store/bootstrap";

const maxHeadingFocusAttempts = 10;

export const App = () => {
  const { errorMessage, status } = useBootstrapView();
  const authentication = useAuthenticationView();

  useEffect(() => {
    if (
      status !== "ready" ||
      (authentication.phase !== "authenticated" &&
        authentication.phase !== "disabled")
    ) {
      return;
    }
    let retryFrame: number | undefined;
    let attempts = 0;
    const focusPageHeading = () => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement.closest("[role='dialog']")
      ) {
        return;
      }
      const heading = document.querySelector<HTMLElement>(
        "main h1[tabindex='-1']",
      );
      if (heading) {
        heading.focus({ preventScroll: true });
        return;
      }
      attempts += 1;
      if (attempts < maxHeadingFocusAttempts) {
        retryFrame = window.requestAnimationFrame(focusPageHeading);
      }
    };
    const frame = window.requestAnimationFrame(focusPageHeading);
    return () => {
      window.cancelAnimationFrame(frame);
      if (retryFrame !== undefined) {
        window.cancelAnimationFrame(retryFrame);
      }
    };
  }, [authentication.phase, status]);

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
      <AppTooltipProvider>
        {authentication.phase === "unauthenticated" ? (
          <LoginScreen />
        ) : (
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        )}
      </AppTooltipProvider>
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
