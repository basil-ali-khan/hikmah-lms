import { Logo } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white md:items-center md:justify-center md:bg-canvas md:py-10">
      <div className="flex h-14 items-center border-b border-line-soft px-4 md:hidden">
        <Logo />
      </div>
      <main id="main" className="w-full px-4 py-6 md:max-w-[440px] md:rounded-2xl md:border md:border-line md:bg-white md:px-8 md:py-8 md:shadow-sm">
        <div className="mb-6 hidden md:block">
          <Logo />
        </div>
        {children}
      </main>
    </div>
  );
}
