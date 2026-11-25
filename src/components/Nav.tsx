"use client";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Watch a house" },
  { href: "/sensors", label: "Sensor check" },
  { href: "/replay", label: "Replay a flood" },
  { href: "/about", label: "How it works" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {LINKS.map((l) => (
        <a key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>
          {l.label}
        </a>
      ))}
    </nav>
  );
}
