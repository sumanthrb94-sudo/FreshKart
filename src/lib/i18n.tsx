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
  outOfStock: { en: "Out of stock", hi: "स्टॉक ख़त्म", te: "స్టాక్ లేదు", mr: "स्टॉक संपला" },
  minOrder: { en: "Min order", hi: "न्यूनतम ऑर्डर", te: "కనీస ఆర్డర్", mr: "किमान ऑर्डर" },
  // Category labels, keyed by their English name.
  "cat.Vegetables": { en: "Vegetables", hi: "सब्ज़ियाँ", te: "కూరగాయలు", mr: "भाज्या" },
  "cat.Leafy Greens": {
    en: "Leafy Greens",
    hi: "हरी पत्तेदार",
    te: "ఆకుకూరలు",
    mr: "पालेभाज्या",
  },
};

// Real produce-name translations, keyed by the English product name.
const PRODUCT_NAMES: Record<string, Dict> = {
  "Onion (New Red)": { en: "Onion (New Red)", hi: "प्याज़ (नया लाल)", te: "ఉల్లిపాయ (కొత్త ఎరుపు)", mr: "कांदा (नवीन लाल)" },
  "Onion (Big)": { en: "Onion (Big)", hi: "प्याज़ (बड़ा)", te: "ఉల్లిపాయ (పెద్దది)", mr: "कांदा (मोठा)" },
  Potato: { en: "Potato", hi: "आलू", te: "బంగాళాదుంప", mr: "बटाटा" },
  Tomato: { en: "Tomato", hi: "टमाटर", te: "టమాటా", mr: "टोमॅटो" },
  "Green Chilli": { en: "Green Chilli", hi: "हरी मिर्च", te: "పచ్చిమిర్చి", mr: "हिरवी मिरची" },
  "Chilli Bajji (Bhajji)": { en: "Chilli Bajji (Bhajji)", hi: "मिर्च भज्जी", te: "మిర్చి బజ్జి", mr: "मिरची भजी" },
  Ginger: { en: "Ginger", hi: "अदरक", te: "అల్లం", mr: "आले" },
  Garlic: { en: "Garlic", hi: "लहसुन", te: "వెల్లుల్లి", mr: "लसूण" },
  Cabbage: { en: "Cabbage", hi: "पत्ता गोभी", te: "క్యాబేజీ", mr: "कोबी" },
  Cauliflower: { en: "Cauliflower", hi: "फूलगोभी", te: "కాలీఫ్లవర్", mr: "फ्लॉवर" },
  "Bottle Gourd": { en: "Bottle Gourd", hi: "लौकी", te: "సొరకాయ", mr: "दुधी भोपळा" },
  "Ladies Finger (Okra)": { en: "Ladies Finger (Okra)", hi: "भिंडी", te: "బెండకాయ", mr: "भेंडी" },
  "Donda (Tindora)": { en: "Donda (Tindora)", hi: "कुंदरू (टिंडोरा)", te: "దొండకాయ", mr: "तोंडली" },
  "Ridge Gourd": { en: "Ridge Gourd", hi: "तोरई", te: "బీరకాయ", mr: "दोडका" },
  Carrot: { en: "Carrot", hi: "गाजर", te: "క్యారెట్", mr: "गाजर" },
  Capsicum: { en: "Capsicum", hi: "शिमला मिर्च", te: "క్యాప్సికం", mr: "ढोबळी मिरची" },
  "Brinjal (Black)": { en: "Brinjal (Black)", hi: "बैंगन (काला)", te: "వంకాయ (నలుపు)", mr: "वांगी (काळी)" },
  "Brinjal (Green / White)": { en: "Brinjal (Green / White)", hi: "बैंगन (हरा/सफ़ेद)", te: "వంకాయ (పచ్చ/తెలుపు)", mr: "वांगी (हिरवी/पांढरी)" },
  "Brinjal (Purple Long)": { en: "Brinjal (Purple Long)", hi: "बैंगन (बैंगनी लंबा)", te: "వంకాయ (ఊదా పొడవు)", mr: "वांगी (जांभळी लांब)" },
  "Dosakai (Yellow Cucumber)": { en: "Dosakai (Yellow Cucumber)", hi: "दोसाकाई (पीला खीरा)", te: "దోసకాయ", mr: "दोसाकाई (पिवळी काकडी)" },
  "Keera (Cucumber)": { en: "Keera (Cucumber)", hi: "खीरा", te: "కీరదోసకాయ", mr: "काकडी" },
  "Beans (French)": { en: "Beans (French)", hi: "फ्रेंच बीन्स", te: "ఫ్రెంచ్ బీన్స్", mr: "फरसबी" },
  "Broad Beans (Chikkudu)": { en: "Broad Beans (Chikkudu)", hi: "सेम (चिक्कुडु)", te: "చిక్కుడుకాయ", mr: "घेवडा" },
  "Cluster Beans (Gokar)": { en: "Cluster Beans (Gokar)", hi: "ग्वार फली", te: "గోరుచిక్కుడు", mr: "गवार" },
  "Bitter Gourd": { en: "Bitter Gourd", hi: "करेला", te: "కాకరకాయ", mr: "कारले" },
  "Raw Banana": { en: "Raw Banana", hi: "कच्चा केला", te: "అరటికాయ", mr: "कच्ची केळी" },
  "Raw Mango": { en: "Raw Mango", hi: "कच्चा आम", te: "మామిడికాయ", mr: "कैरी" },
  Lemon: { en: "Lemon", hi: "नींबू", te: "నిమ్మకాయ", mr: "लिंबू" },
  Beetroot: { en: "Beetroot", hi: "चुकंदर", te: "బీట్‌రూట్", mr: "बीट" },
  Drumstick: { en: "Drumstick", hi: "सहजन", te: "మునగకాయ", mr: "शेवगा" },
  Radish: { en: "Radish", hi: "मूली", te: "ముల్లంగి", mr: "मुळा" },
  "Curry Leaves": { en: "Curry Leaves", hi: "करी पत्ता", te: "కరివేపాకు", mr: "कढीपत्ता" },
  "Kothimeer (Coriander)": { en: "Kothimeer (Coriander)", hi: "धनिया", te: "కొత్తిమీర", mr: "कोथिंबीर" },
  "Pudina (Mint)": { en: "Pudina (Mint)", hi: "पुदीना", te: "పుదీనా", mr: "पुदिना" },
  "Palak (Spinach)": { en: "Palak (Spinach)", hi: "पालक", te: "పాలకూర", mr: "पालक" },
  Gongura: { en: "Gongura", hi: "गोंगुरा", te: "గోంగూర", mr: "अंबाडी" },
  "Thotakura (Amaranth)": { en: "Thotakura (Amaranth)", hi: "चौलाई", te: "తోటకూర", mr: "राजगिरा" },
  "Methi (Fenugreek)": { en: "Methi (Fenugreek)", hi: "मेथी", te: "మెంతికూర", mr: "मेथी" },
  "Spring Onion": { en: "Spring Onion", hi: "हरा प्याज़", te: "ఉల్లికాడలు", mr: "हिरवा कांदा" },
};

const KEY = "green-basket.lang.v1";

interface LangValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Translate a key for the current language (falls back to English). */
  t: (key: string) => string;
  /** Translate a category by its English name (falls back to the name). */
  tCategory: (name: string) => string;
  /** Translate a product by its English name (falls back to the name). */
  tProduct: (name: string) => string;
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
  const tProduct = useCallback(
    (name: string) => PRODUCT_NAMES[name]?.[lang] ?? name,
    [lang]
  );

  const value = useMemo<LangValue>(
    () => ({ lang, setLang, t, tCategory, tProduct }),
    [lang, setLang, t, tCategory, tProduct]
  );
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within <LanguageProvider>");
  return ctx;
}
