import { Inter, Lato, Merriweather, Noto_Sans, Open_Sans, Poppins, Raleway, Roboto } from "next/font/google";

// Every font selectable in Site Settings is declared here (self-hosted by next/font, no Google requests
// at runtime). Only the fonts actually used on a page get downloaded by the browser.
const raleway = Raleway({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-raleway", display: "swap" });
const roboto = Roboto({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-roboto", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap", preload: false });
const lato = Lato({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-lato", display: "swap", preload: false });
const openSans = Open_Sans({ subsets: ["latin"], variable: "--font-open-sans", display: "swap", preload: false });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-poppins", display: "swap", preload: false });
const merriweather = Merriweather({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-merriweather", display: "swap", preload: false });
const notoSans = Noto_Sans({ subsets: ["latin"], variable: "--font-noto-sans", display: "swap", preload: false });

export const fontClassNames = [raleway, roboto, inter, lato, openSans, poppins, merriweather, notoSans]
  .map((f) => f.variable)
  .join(" ");

const FONT_VARS: Record<string, string> = {
  Raleway: "--font-raleway",
  Roboto: "--font-roboto",
  Inter: "--font-inter",
  Lato: "--font-lato",
  "Open Sans": "--font-open-sans",
  Poppins: "--font-poppins",
  Merriweather: "--font-merriweather",
  "Noto Sans": "--font-noto-sans",
};

export function fontStack(name: string, fallback: string) {
  return `var(${FONT_VARS[name] ?? FONT_VARS[fallback]}), system-ui, sans-serif`;
}
