import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ReferenceProvider } from "./lib/ReferenceData";
import { CurrentUserProvider } from "./lib/CurrentUser";
import { LanguageProvider } from "./lib/i18n";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LanguageProvider>
      <ReferenceProvider>
        <CurrentUserProvider>
          <App />
        </CurrentUserProvider>
      </ReferenceProvider>
    </LanguageProvider>
  </StrictMode>
);
