import { Code, KeyRound, MessageSquare, TerminalSquare, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; short: string; icon: LucideIcon };

/**
 * Navigation principale BCX : une seule interface avec deux espaces.
 * Le chat conserve l'assistant IA ; Codex ouvre l'éditeur de code.
 * Les anciens modules ne sont plus exposés dans la navigation.
 */
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Espace de travail",
    items: [
      { href: "/ai", label: "Chat", short: "Chat", icon: MessageSquare },
      { href: "/studio", label: "Codex Studio", short: "Studio", icon: Code },
      { href: "/workspace", label: "IDE Cloud", short: "IDE", icon: TerminalSquare },
    ],
  },
  { label: "Développeurs", items: [{ href: "/settings/api-keys", label: "Clés API", short: "API", icon: KeyRound }] },
];

export const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);
export const MOBILE_NAV = ALL_NAV.filter((item) => item.href !== "/settings/api-keys");

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}
