import { Archive, Lock } from "pixelarticons/react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loginAuthentication } from "@/store";

const fieldClass =
  "h-10 w-full border-2 border-[var(--border-ink)] bg-card px-3 font-mono text-sm text-foreground shadow-[var(--shadow-chip)] outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none";

export const LoginScreen = () => {
  const [errorMessage, setErrorMessage] = useState<string>();
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!errorMessage) {
      return;
    }
    const input = formRef.current?.elements.namedItem("password");
    if (input instanceof HTMLInputElement) {
      input.focus();
    }
  }, [errorMessage]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const emailValue = formData.get("email");
    const passwordValue = formData.get("password");
    const email = typeof emailValue === "string" ? emailValue.trim() : "";
    const password = typeof passwordValue === "string" ? passwordValue : "";
    const nextEmailError = email ? undefined : "Email is required.";
    const nextPasswordError = password ? undefined : "Password is required.";
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) {
      const firstInvalidInput = form.elements.namedItem(
        nextEmailError ? "email" : "password",
      );
      if (firstInvalidInput instanceof HTMLInputElement) {
        firstInvalidInput.focus();
      }
      return;
    }
    setErrorMessage(undefined);
    setSubmitting(true);
    const request = loginAuthentication(email, password);
    const passwordInput = form.elements.namedItem("password");
    if (passwordInput instanceof HTMLInputElement) {
      passwordInput.value = "";
    }
    void request.then((result) => {
      if (!result.shellAvailable) {
        setErrorMessage(result.errorMessage);
        setSubmitting(false);
      }
    });
  };

  return (
    <main className="text-foreground min-h-svh bg-[var(--ground)] px-5 py-10 sm:grid sm:place-items-center sm:px-8">
      <section
        className="mx-auto w-full max-w-md"
        aria-labelledby="login-title"
      >
        <div className="mb-5 flex items-center justify-center gap-3 text-[var(--frame-foreground)]">
          <Archive className="size-6" aria-hidden="true" />
          <span className="text-pixel text-xl leading-none">Mina</span>
        </div>
        <Card className="gap-0 py-0">
          <div className="flex items-center justify-between border-b-2 border-[var(--border-ink)] bg-[var(--color-class-transfer-bright)] px-4 py-2 font-mono text-xs font-bold uppercase">
            <h1 id="login-title">Household access</h1>
            <Lock className="size-4" aria-hidden="true" />
          </div>
          <CardContent className="py-5">
            <form
              ref={formRef}
              className="flex flex-col gap-4"
              noValidate
              onSubmit={onSubmit}
            >
              <label className="flex flex-col gap-1.5 font-mono text-xs font-bold uppercase">
                Email
                <input
                  autoComplete="username"
                  autoFocus
                  aria-describedby={
                    emailError ? "login-email-error" : undefined
                  }
                  aria-invalid={Boolean(emailError)}
                  className={fieldClass}
                  disabled={submitting}
                  inputMode="email"
                  name="email"
                  onBlur={(event) => {
                    setEmailError(
                      event.currentTarget.value.trim()
                        ? undefined
                        : "Email is required.",
                    );
                  }}
                  onChange={(event) => {
                    if (event.currentTarget.value.trim()) {
                      setEmailError(undefined);
                    }
                  }}
                  required
                  type="text"
                />
                {emailError ? (
                  <span
                    id="login-email-error"
                    className="text-destructive font-sans text-sm normal-case"
                  >
                    {emailError}
                  </span>
                ) : null}
              </label>
              <label className="flex flex-col gap-1.5 font-mono text-xs font-bold uppercase">
                Password
                <input
                  autoComplete="current-password"
                  aria-describedby={
                    passwordError ? "login-password-error" : undefined
                  }
                  aria-invalid={Boolean(passwordError)}
                  className={fieldClass}
                  disabled={submitting}
                  name="password"
                  onBlur={(event) => {
                    setPasswordError(
                      event.currentTarget.value
                        ? undefined
                        : "Password is required.",
                    );
                  }}
                  onChange={(event) => {
                    if (event.currentTarget.value) {
                      setPasswordError(undefined);
                    }
                  }}
                  required
                  type="password"
                />
                {passwordError ? (
                  <span
                    id="login-password-error"
                    className="text-destructive font-sans text-sm normal-case"
                  >
                    {passwordError}
                  </span>
                ) : null}
              </label>
              {errorMessage ? (
                <p className="text-destructive font-sans text-sm" role="alert">
                  {errorMessage}
                </p>
              ) : null}
              <Tooltip
                label="Checking access..."
                className="mt-1 w-full"
                disabled={!submitting}
                focusable={submitting}
              >
                <Button
                  className="h-10 w-full"
                  disabled={submitting}
                  type="submit"
                >
                  {submitting ? "Checking access..." : "Enter Mina"}
                </Button>
              </Tooltip>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
};
