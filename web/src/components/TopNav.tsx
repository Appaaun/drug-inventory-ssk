"use client";

import { useRouter } from "next/navigation";

export default function TopNav({
  section,
  username,
}: {
  section: string;
  username?: string | null;
}) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 border-b border-line/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <div className="flex items-baseline gap-2.5 overflow-hidden">
          <span className="brand-serif whitespace-nowrap text-[18px] text-foreground">
            อบจ.ศรีสะเกษ
          </span>
          <span className="h-3.5 w-px shrink-0 bg-line" />
          <span className="truncate text-[15px] tracking-tight text-muted">{section}</span>
        </div>
        {username && (
          <div className="flex shrink-0 items-center gap-4">
            <span className="hidden items-center gap-1.5 text-sm text-muted sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              {username}
            </span>
            <button
              onClick={logout}
              className="rounded-full bg-accent px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-accent-hover active:scale-[0.97]"
            >
              ออกจากระบบ
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
