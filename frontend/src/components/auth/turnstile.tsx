"use client";

import { useEffect, useRef } from "react";

import { useNonce, useSite } from "@/components/providers";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loader: Promise<void> | null = null;

function loadScript(nonce?: string) {
  loader ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    if (nonce) s.nonce = nonce;
    s.onload = () => resolve();
    s.onerror = () => {
      loader = null;
      reject(new Error("Bot check failed to load"));
    };
    document.head.appendChild(s);
  });
  return loader;
}

/** Cloudflare Turnstile (invisible/managed). Renders nothing unless the turnstile flag is on. */
export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const site = useSite();
  const nonce = useNonce();
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  useEffect(() => {
    cb.current = onToken;
  }, [onToken]);

  const enabled = site.flags.turnstile && !!site.turnstile_site_key;

  useEffect(() => {
    if (!enabled || !ref.current) return;
    let id: string | undefined;
    let cancelled = false;
    loadScript(nonce)
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        id = window.turnstile.render(ref.current, {
          sitekey: site.turnstile_site_key,
          appearance: "interaction-only",
          callback: (t: string) => cb.current(t),
          "expired-callback": () => cb.current(""),
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [enabled, nonce, site.turnstile_site_key]);

  if (!enabled) return null;
  return <div ref={ref} />;
}
