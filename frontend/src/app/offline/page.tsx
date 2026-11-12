export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl">You&apos;re offline</h1>
      <p className="text-subtle">Reconnect to continue. Quiz answers you already saved are safe on our server.</p>
    </main>
  );
}
