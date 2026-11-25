import {
  BookOpen, Code2, FileSpreadsheet, FileText,
  MessageSquare, Plug, Settings, type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  short: string;
  description: string;
  icon: LucideIcon;
};

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Développement",
    items: [
      { href: "/ai", label: "Chat", short: "Chat", description: "Conversations et fonctions IA existantes.", icon: MessageSquare },
      { href: "/codex", label: "Codex", short: "Codex", description: "Projets avancés et éditeurs réunis.", icon: Code2 },
    ],
  },
  {
    label: "Création et données",
    items: [
      { href: "/ai/documents", label: "Documents", short: "Documents", description: "Rédige un document et exporte-le en Word, Markdown ou PDF.", icon: FileText },
      { href: "/ai/spreadsheets", label: "Tableurs", short: "Tableurs", description: "Importe un fichier Excel et explore ses statistiques.", icon: FileSpreadsheet },
    ],
  },
  {
    label: "Intégrations et compte",
    items: [
      { href: "/plugins", label: "Plugins", short: "Plugins", description: "Explore GitHub et les autres intégrations BCX.", icon: Plug },
      { href: "/ai/memories", label: "Mémoire IA", short: "Mémoire", description: "Consulte et gère ce que l’assistant mémorise.", icon: BookOpen },
      { href: "/settings", label: "Paramètres", short: "Réglages", description: "Gère ton compte, ton thème et les données sur cet appareil.", icon: Settings },
    ],
  },
];

export const ALL_NAV = NAV_GROUPS.flatMap((group) => group.items);
export const MOBILE_NAV = ALL_NAV.filter(({ href }) => ["/ai", "/codex", "/plugins", "/settings"].includes(href));

export function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && href !== "/ai" && pathname.startsWith(href + "/"));
}
