"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl">Something went wrong</h1>
      <p className="text-subtle">Please try again. If it keeps happening, contact support{error.digest ? ` (ref ${error.digest})` : ""}.</p>
      <button onClick={reset} className="min-h-12 rounded-[10px] bg-primary px-6 font-medium text-white">
        Try again
      </button>
    </main>
  );
}
