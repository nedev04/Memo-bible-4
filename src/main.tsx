import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Просим браузер не удалять данные автоматически при нехватке места (не везде поддерживается)
navigator.storage?.persist?.().catch(() => {});
