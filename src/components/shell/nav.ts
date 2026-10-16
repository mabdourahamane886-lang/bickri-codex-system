import { Cloud, Code, Fingerprint, LayoutDashboard, Megaphone, Settings, Sparkles, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; short: string; icon: LucideIcon };

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Espace de travail",
    items: [
      { href: "/", label: "Tableau de bord", short: "Accueil", icon: LayoutDashboard },
      { href: "/registry", label: "Registre BCX", short: "Registre", icon: Fingerprint },
      { href: "/studio", label: "Studio de code", short: "Studio", icon: Code },
      { href: "/ai", label: "Bickri Code AI", short: "IA", icon: Sparkles },
      { href: "/publicite", label: "Studio publicitaire", short: "Affiche", icon: Megaphone },
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
export const MOBILE_NAV = ["/", "/registry", "/studio", "/ai", "/publicite", "/settings"].map((h) => ALL_NAV.find((i) => i.href === h)!);

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}
