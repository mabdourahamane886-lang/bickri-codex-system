import {
  BookOpen, Code2, FileSpreadsheet, FileText, Fingerprint, Image,
  MessageSquare, Plug, Settings, SquareTerminal, type LucideIcon,
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
      { href: "/ai", label: "Bickri AI", short: "Chat", description: "Discute, analyse des fichiers et retrouve tes conversations.", icon: MessageSquare },
      { href: "/studio", label: "Codex Studio", short: "Studio", description: "Édite tes fichiers HTML, CSS et JavaScript avec aperçu et console.", icon: Code2 },
      { href: "/workspace", label: "IDE Cloud", short: "IDE", description: "Gère tes projets et lance ton code dans l’espace de travail.", icon: SquareTerminal },
    ],
  },
  {
    label: "Création et données",
    items: [
      { href: "/images", label: "Studio d’images", short: "Images", description: "Génère, retouche et télécharge des images.", icon: Image },
      { href: "/ai/documents", label: "Documents", short: "Documents", description: "Rédige un document et exporte-le en Word, Markdown ou PDF.", icon: FileText },
      { href: "/ai/spreadsheets", label: "Tableurs", short: "Tableurs", description: "Importe un fichier Excel et explore ses statistiques.", icon: FileSpreadsheet },
      { href: "/registry", label: "Registre BCX", short: "Registre", description: "Crée, recherche et exporte tes identifiants BCX.", icon: Fingerprint },
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
export const MOBILE_NAV = ALL_NAV.filter(({ href }) => ["/ai", "/studio", "/workspace", "/plugins", "/settings"].includes(href));

export function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && href !== "/ai" && pathname.startsWith(href + "/"));
}
