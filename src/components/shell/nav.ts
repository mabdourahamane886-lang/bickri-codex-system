import { Cloud, Code, Fingerprint, Megaphone, MessageSquare, Settings, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; short: string; icon: LucideIcon };

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Conversation",
    items: [
      { href: "/", label: "Bickri Chat", short: "Chat", icon: MessageSquare },
    ],
  },
  {
    label: "Outils de travail",
    items: [
      { href: "/studio", label: "Studio de code", short: "Studio", icon: Code },
      { href: "/publicite", label: "Studio publicitaire", short: "Affiche", icon: Megaphone },
      { href: "/registry", label: "Registre BCX", short: "Registre", icon: Fingerprint },
    ],
  },
  {
    label: "Plateforme",
    items: [
      { href: "/cloud", label: "BCX Cloud", short: "Cloud", icon: Cloud },
      { href: "/settings", label: "Paramètres", short: "Réglages", icon: Settings },
    ],
  },
];

export const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);
export const MOBILE_NAV = ["/", "/studio", "/publicite", "/registry", "/settings"].map((h) => ALL_NAV.find((i) => i.href === h)!);

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}
