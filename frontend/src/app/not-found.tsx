import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-heading text-6xl font-extrabold text-primary">404</p>
      <h1 className="text-2xl">This page doesn&apos;t exist</h1>
      <p className="text-subtle">The link may be old, or the course may no longer be published.</p>
      <Link href="/courses" className="inline-flex min-h-12 w-full items-center justify-center rounded-[10px] bg-primary px-4 font-medium text-white">
        Browse courses
      </Link>
      <Link href="/" className="font-medium text-primary">
        Go home
      </Link>
    </main>
  );
}
