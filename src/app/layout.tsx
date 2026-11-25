import type { Metadata, Viewport } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "JagaBanjir — watch the river by your parents' house",
  description:
    "Pick your family's house, and get a plain flood message in their language when the nearest JPS river gauge changes level. Every sensor is checked before it is trusted.",
};

export const viewport: Viewport = { themeColor: "#14233a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="wrap">
            <a className="brand" href="/">
              <svg width="18" height="26" viewBox="0 0 18 26" aria-hidden>
                <rect x="1" y="1" width="16" height="24" fill="#fff" stroke="#14233a" strokeWidth="1.5" />
                <rect x="1" y="4" width="10" height="3" fill="#14233a" />
                <rect x="1" y="10" width="6" height="3" fill="#14233a" />
                <rect x="1" y="16" width="10" height="3" fill="#c8312b" />
                <rect x="1.75" y="18" width="14.5" height="6.25" fill="#2f6f8f" opacity=".8" />
              </svg>
              JagaBanjir
            </a>
            <Nav />
          </div>
        </header>
        <main>
          <div className="wrap">{children}</div>
        </main>
        <footer className="site">
          <div className="wrap">
            <p>
              River data: Jabatan Pengairan dan Saliran (JPS), via{" "}
              <a href="https://publicinfobanjir.water.gov.my/">Public InfoBanjir</a>. Map: © OpenStreetMap contributors.
            </p>
            <p>
              JagaBanjir is a student project and not an official warning service. In an emergency, call 999 and follow
              Bomba, APM and police instructions.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
