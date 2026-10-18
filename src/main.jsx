import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppDataProvider } from "./context/AppDataContext";
import { ToastProvider } from "./components/Toast";
import { PeriodProvider } from "./context/PeriodContext";
import { AuthProvider } from "./context/AuthContext";
import { LookupsProvider } from "./context/LookupsContext";
// Lexend Deca font (bundled, works offline)
import "@fontsource/lexend-deca/300.css";
import "@fontsource/lexend-deca/400.css";
import "@fontsource/lexend-deca/500.css";
import "@fontsource/lexend-deca/600.css";
import "@fontsource/lexend-deca/700.css";
import "@fontsource/lexend-deca/800.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <AuthProvider>
      <LookupsProvider>
        <AppDataProvider>
          <PeriodProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </PeriodProvider>
        </AppDataProvider>
      </LookupsProvider>
    </AuthProvider>
  </BrowserRouter>
);