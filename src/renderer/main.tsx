import "./index.css";
import { createRoot } from "react-dom/client";
import App from "./App";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

// Versión web: guardar la aplicación para poder abrirla sin internet
if (!window.electron && import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch((err) => {
    console.warn("No se pudo activar el modo sin conexión:", err);
  });
}
