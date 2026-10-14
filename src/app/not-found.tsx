import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";

export default function NotFound() {
  return (
    <main className="notfound">
      <div className="stack" style={{ justifyItems: "center" }}>
        <LogoMark className="logo-mark" />
        <span className="code-id">BCX-404</span>
        <h1 style={{ fontSize: "var(--text-lg)" }}>Page introuvable</h1>
        <p className="muted">Cette adresse n&apos;existe pas ou a été déplacée.</p>
        <Link href="/" className="btn btn-primary">Retour au tableau de bord</Link>
      </div>
    </main>
  );
}
