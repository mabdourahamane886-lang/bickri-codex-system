"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ChevronRight, LogIn, LogOut } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { useSession } from "@/components/providers/SessionProvider";
import { ALL_NAV, MOBILE_NAV, NAV_GROUPS, isActive } from "./nav";

function AccountCard() {
  const { configured, loading, user, signOut } = useSession();
  if (loading) return <div className="account-card"><span className="avatar skeleton" /><div className="account-meta"><span className="skeleton" style={{ display: "block", height: 10, width: "70%" }} /></div></div>;
  if (!user) {
    return (
      <Link href="/login" className="account-card">
        <span className="avatar"><LogIn size={14} /></span>
        <span className="account-meta"><b>Se connecter</b><small>{configured ? "Registre partagé" : "Mode local"}</small></span>
      </Link>
    );
  }
  const email = user.email ?? "Compte";
  return (
    <div className="account-card">
      <span className="avatar">{email.slice(0, 2).toUpperCase()}</span>
      <span className="account-meta"><b title={email}>{email}</b><small>Connecté</small></span>
      <button className="btn btn-ghost btn-icon btn-sm" onClick={signOut} aria-label="Se déconnecter" title="Se déconnecter"><LogOut /></button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const current = ALL_NAV.find((i) => isActive(pathname, i.href));

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Navigation principale">
        <div className="sidebar-head"><Link href="/"><Logo /></Link></div>
        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.items.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className="nav-link" aria-current={isActive(pathname, href) ? "page" : undefined}>
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot"><AccountCard /></div>
      </aside>

      <div className="main">
        <header className="topbar">
          <Link href="/" className="topbar-mobile-brand" aria-label="Bickri Codex System — Accueil"><span className="theta-mark" aria-hidden="true">Θ</span></Link>
          <div className="breadcrumbs">
            <span>BCX</span><ChevronRight size={14} aria-hidden="true" /><b>{current?.label ?? "Page"}</b>
          </div>
        </header>
        {children}
      </div>

      <nav className="mobile-nav" aria-label="Navigation mobile">
        {MOBILE_NAV.map(({ href, short, icon: Icon }) => (
          <Link key={href} href={href} aria-current={isActive(pathname, href) ? "page" : undefined}>
            <Icon aria-hidden="true" />
            <span>{short}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
