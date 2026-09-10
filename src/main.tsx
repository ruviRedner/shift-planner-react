import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Workspace } from "./Workspace";
import { App as AntApp, ConfigProvider } from "antd";
import heIL from "antd/locale/he_IL";
import "dayjs/locale/he";
import "antd/dist/reset.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfigProvider direction="rtl" locale={heIL}>
      <AntApp><Workspace /></AntApp>
    </ConfigProvider>
  </StrictMode>,
);
