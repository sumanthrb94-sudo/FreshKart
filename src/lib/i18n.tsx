"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Lang = "en" | "hi" | "te" | "mr";

/** Languages offered in the on-screen scroller (shown in their own script). */
export const LANGS: { code: Lang; native: string }[] = [
  { code: "en", native: "English" },
  { code: "hi", native: "हिन्दी" },
  { code: "te", native: "తెలుగు" },
  { code: "mr", native: "मराठी" },
];

type Dict = Record<Lang, string>;

const STRINGS: Record<string, Dict> = {
  tagline: {
    en: "Wholesale B2B · per kg",
    hi: "थोक B2B · प्रति किलो",
    te: "హోల్‌సేల్ B2B · కిలోకు",
    mr: "घाऊक B2B · प्रति किलो",
  },
  searchProduce: {
    en: "Search produce…",
    hi: "उत्पाद खोजें…",
    te: "ఉత్పత్తులను వెతకండి…",
    mr: "उत्पादने शोधा…",
  },
  all: { en: "All", hi: "सभी", te: "అన్నీ", mr: "सर्व" },
  add: { en: "ADD", hi: "जोड़ें", te: "జోడించు", mr: "जोडा" },
  noItemsTitle: {
    en: "No items found.",
    hi: "कोई वस्तु नहीं मिली।",
    te: "వస్తువులు దొరకలేదు.",
    mr: "वस्तू सापडल्या नाहीत.",
  },
  noItemsSub: {
    en: "Try a different search or category.",
    hi: "कोई दूसरी खोज या श्रेणी आज़माएँ।",
    te: "వేరే శోధన లేదా వర్గాన్ని ప్రయత్నించండి.",
    mr: "वेगळा शोध किंवा श्रेणी वापरून पाहा.",
  },
  promoTitle: {
    en: "Wholesale fruits & veggies",
    hi: "थोक फल और सब्ज़ियाँ",
    te: "హోల్‌సేల్ పండ్లు & కూరగాయలు",
    mr: "घाऊक फळे आणि भाज्या",
  },
  promoSub: {
    en: "Live B2B rates · order in bulk · pay COD, credit or online.",
    hi: "लाइव B2B रेट · थोक में ऑर्डर · COD, क्रेडिट या ऑनलाइन भुगतान।",
    te: "లైవ్ B2B రేట్లు · బల్క్‌గా ఆర్డర్ · COD, క్రెడిట్ లేదా ఆన్‌లైన్ చెల్లింపు.",
    mr: "लाइव्ह B2B दर · घाऊक ऑर्डर · COD, क्रेडिट किंवा ऑनलाइन पेमेंट.",
  },
  callSupport: {
    en: "Call support",
    hi: "सहायता को कॉल करें",
    te: "సపోర్ట్‌కు కాల్ చేయండి",
    mr: "सपोर्टला कॉल करा",
  },
  couldntLoad: {
    en: "Couldn't load the shop",
    hi: "दुकान लोड नहीं हो सकी",
    te: "షాప్ లోడ్ కాలేదు",
    mr: "दुकान लोड होऊ शकले नाही",
  },
  // Category labels, keyed by their English name.
  "cat.Vegetables": { en: "Vegetables", hi: "सब्ज़ियाँ", te: "కూరగాయలు", mr: "भाज्या" },
  "cat.Leafy Greens": {
    en: "Leafy Greens",
    hi: "हरी पत्तेदार",
    te: "ఆకుకూరలు",
    mr: "पालेभाज्या",
  },
};

const KEY = "freshkart.lang.v1";

interface LangValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Translate a key for the current language (falls back to English). */
  t: (key: string) => string;
  /** Translate a category by its English name (falls back to the name). */
  tCategory: (name: string) => string;
}

const LangContext = createContext<LangValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY) as Lang | null;
      if (saved && LANGS.some((l) => l.code === saved)) setLangState(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback((key: string) => STRINGS[key]?.[lang] ?? STRINGS[key]?.en ?? key, [lang]);
  const tCategory = useCallback(
    (name: string) => STRINGS[`cat.${name}`]?.[lang] ?? name,
    [lang]
  );

  const value = useMemo<LangValue>(() => ({ lang, setLang, t, tCategory }), [lang, setLang, t, tCategory]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within <LanguageProvider>");
  return ctx;
}
