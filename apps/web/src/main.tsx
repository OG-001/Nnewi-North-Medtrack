import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { SessionProvider } from "./lib/session";
import { seedIfEmpty } from "./db/seed";
import "./index.css";

// PWA service worker — app shell available offline (phase-0 §3).
registerSW({ immediate: true });

async function bootstrap() {
  await seedIfEmpty();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <BrowserRouter>
        <SessionProvider>
          <App />
        </SessionProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
}

void bootstrap();
