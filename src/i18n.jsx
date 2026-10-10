import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zh from "./locales/zh-CN/trans.json";
import en from "./locales/en-US/trans.json";

// 尝试从 localStorage 中获取保存的语言设置，如果没有则使用默认值 'zh'
const savedLanguage = localStorage.getItem("lang") || "zh";

const resources = {
  en: {
    translation: en,
  },
  zh: {
    translation: zh,
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: savedLanguage, // 关键：使用从 localStorage 读取的语言作为初始语言
  fallbackLng: "zh",
  // i18next's debug mode prints every lookup; useful while translating, noise
  // in production.
  debug: import.meta.env.DEV,
  interpolation: {
    escapeValue: false, // React 已经默认转义了，防止 XSS
  },
});

/* The document language has to follow the UI language. `index.html` hardcodes
 * `<html lang="zh">`, so an English reader was served a page that screen readers
 * announce as Chinese and that browser translation offers to translate *into*
 * Chinese. `zh` is mapped to the full tag, because `lang="zh"` is ambiguous
 * between Simplified and Traditional. */
function applyDocumentLanguage(lng) {
  document.documentElement.lang = lng === "zh" ? "zh-CN" : "en";
}

applyDocumentLanguage(savedLanguage);

// 监听语言变化事件，并持久化到 localStorage
i18n.on("languageChanged", (lng) => {
  localStorage.setItem("lang", lng);
  applyDocumentLanguage(lng);
});

// A missing key renders as the raw key, which is easy to ship by accident —
// name it in dev so it is caught while translating.
i18n.on("missingKey", (lngs, namespace, key) => {
  if (import.meta.env.DEV) {
    console.warn(`[i18n] missing key "${key}"`, { lngs, namespace });
  }
});

export default i18n;
