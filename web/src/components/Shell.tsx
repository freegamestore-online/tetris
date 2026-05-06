import type { ReactNode } from "react";

interface ShellProps {
  children: ReactNode;
  sidebar?: ReactNode;
}

export function Shell({ children, sidebar }: ShellProps) {
  return (
    <>
      {/* Desktop: sidebar + main */}
      <div className="hidden md:flex h-screen">
        <aside
          className="flex flex-col border-r h-full shrink-0"
          style={{
            width: "17rem",
            borderColor: "var(--line)",
            background: "var(--panel)",
          }}
        >
          <div className="p-6 font-bold text-lg" style={{ fontFamily: "Fraunces, serif" }}>
            tetris
          </div>
          {sidebar ?? <nav className="flex-1 px-4" />}
          <div className="p-4 text-xs" style={{ color: "var(--muted)" }}>
            <a
              href="https://freegamestore.online"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: "var(--muted)" }}
            >
              Part of FreeGameStore — free forever
            </a>
          </div>
        </aside>
        <main className="flex-1 overflow-auto p-8">{children}</main>
      </div>

      {/* Mobile: header + main + dock.
          h-screen (= 100vh) overflows the visible viewport on iOS Safari
          when the URL bar is shown — 100vh is the LARGE viewport (URL
          bar hidden), so on initial load the page is taller than what
          you can see, and the body becomes scrollable. 100dvh tracks
          the actual visible area as the URL bar shows/hides.
          overflow-hidden on main blocks rubber-band scroll inside. */}
      <div className="flex flex-col md:hidden" style={{ height: '100dvh' }}>
        <header
          className="flex items-center px-4 h-14 border-b shrink-0"
          style={{ borderColor: "var(--line)", background: "var(--panel)" }}
        >
          <span className="font-bold" style={{ fontFamily: "Fraunces, serif" }}>
            tetris
          </span>
        </header>
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </>
  );
}
