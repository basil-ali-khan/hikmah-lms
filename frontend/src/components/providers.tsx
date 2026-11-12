"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useState } from "react";

import { ApiError } from "@/lib/api";
import type { SiteConfig } from "@/lib/types";

import { InstallPrompt } from "./install-prompt";
import { ToastProvider } from "./ui/toast";

const SiteContext = createContext<SiteConfig | null>(null);
const NonceContext = createContext<string | undefined>(undefined);

export function useSite() {
  const site = useContext(SiteContext);
  if (!site) throw new Error("useSite outside Providers");
  return site;
}

export const useNonce = () => useContext(NonceContext);

export function Providers({ site, nonce, children }: { site: SiteConfig; nonce?: string; children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <SiteContext.Provider value={site}>
      <NonceContext.Provider value={nonce}>
        <QueryClientProvider client={client}>
          <ToastProvider>
            {children}
            {site.flags.pwa_install_prompt && <InstallPrompt />}
          </ToastProvider>
        </QueryClientProvider>
      </NonceContext.Provider>
    </SiteContext.Provider>
  );
}
