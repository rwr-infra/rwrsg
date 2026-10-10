import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "@ant-design/v5-patch-for-react-19";
import { ConfigProvider, Watermark } from "antd";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import App from "./App";
import "./i18n";
import i18n from "./i18n";
import "./app.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <HashRouter>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: "#9cc321",
          },
        }}
        locale={{ zh: zhCN, en: enUS }[i18n.language]}
      >
        <Watermark content={["RWR Store Generator"]}>
          <Suspense
            fallback={
              <div
                style={{
                  height: "100vh",
                  /* Was 100vh — a square viewport that pushed the label off
                   * centre on every non-square window. */
                  width: "100%",
                  alignContent: "center",
                  textAlign: "center",
                }}
              >
                <h1>RWRSG</h1>
              </div>
            }
          >
            <App />
          </Suspense>
        </Watermark>
      </ConfigProvider>
    </HashRouter>
  </StrictMode>
);
