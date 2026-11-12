"use client";

import { useEffect, useState } from "react";

import { LogoMark } from "./brand";
import { useSite } from "./providers";
import { Button } from "./ui";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const DISMISS_KEY = "hikmah.install.dismissed";

/** "Add to home screen" prompt on supporting phones (Android/Chrome). Dismissal remembered per device. */
export function InstallPrompt() {
  const site = useSite();
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* storage blocked */
    }
    if (dismissed) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!event) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setEvent(null);
  };
  return (
    <div className="fixed inset-x-3 bottom-20 z-40 flex items-center gap-3 rounded-2xl border border-line bg-white p-3 shadow-lg md:hidden">
      <LogoMark size={36} />
      <p className="flex-1 text-[13px]">Add {site.institute_name} to your home screen</p>
      <Button size="sm" variant="subtle" onClick={dismiss}>
        Not now
      </Button>
      <Button
        size="sm"
        onClick={async () => {
          await event.prompt();
          dismiss();
        }}
      >
        Install
      </Button>
    </div>
  );
}
