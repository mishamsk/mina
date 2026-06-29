import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App, BootstrapSplash } from "./app";
import { hydrateBrowserState } from "./store/bootstrap";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("missing root element");
}

const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <BootstrapSplash />
  </StrictMode>,
);

void hydrateBrowserState().finally(() => {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
