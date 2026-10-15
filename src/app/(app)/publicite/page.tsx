"use client";

import { useState } from "react";
import { Download, Eye, Megaphone, Palette, RotateCcw, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

const defaults = {
  eyebrow: "VOTRE PARTENAIRE DIGITAL",
  headline: "DONNEZ VIE À\nVOS AMBITIONS.",
  description: "Des solutions digitales premium pour développer votre marque, attirer vos clients et accélérer votre croissance.",
  cta: "PRÊT À PASSER AU NIVEAU SUPÉRIEUR ?",
  contact: "BICKRI SERVICE AGENCY · CRÉATIVITÉ • TECHNOLOGIE • RÉSULTATS",
};

const services = [
  { number: "01", title: "Identité visuelle", detail: "Logos & chartes graphiques" },
  { number: "02", title: "Création web", detail: "Sites modernes & applications" },
  { number: "03", title: "Marketing digital", detail: "Stratégie & réseaux sociaux" },
  { number: "04", title: "Intelligence artificielle", detail: "Outils IA & automatisation" },
];

export default function AdStudioPage() {
  const [copy, setCopy] = useState(defaults);
  const [showServices, setShowServices] = useState(true);
  const [gold, setGold] = useState("#E9B95E");
  const [blue, setBlue] = useState("#07152E");

  function reset() {
    setCopy(defaults);
    setShowServices(true);
    setGold("#E9B95E");
    setBlue("#07152E");
  }

  function update(field: keyof typeof defaults, value: string) {
    setCopy((current) => ({ ...current, [field]: value }));
  }

  return (
    <main className="content ad-studio">
      <PageHeader
        title="Studio publicitaire"
        description="Crée une affiche premium Bickri Service Agency, personnalise le texte et les couleurs, puis exporte-la en PDF depuis ton navigateur."
      />

      <div className="ad-workspace">
        <section className="card card-pad ad-controls">
          <div className="ad-panel-title"><span className="ad-icon"><Palette size={18} /></span><div><h2>Personnalisation</h2><p className="muted">Les modifications s’affichent instantanément.</p></div></div>
          <label className="ad-field">Surtitre<input className="input" value={copy.eyebrow} maxLength={70} onChange={(e) => update("eyebrow", e.target.value)} /></label>
          <label className="ad-field">Titre principal<textarea className="input" rows={3} value={copy.headline} maxLength={100} onChange={(e) => update("headline", e.target.value)} /></label>
          <label className="ad-field">Description<textarea className="input" rows={4} value={copy.description} maxLength={260} onChange={(e) => update("description", e.target.value)} /></label>
          <label className="ad-field">Appel à l’action<input className="input" value={copy.cta} maxLength={90} onChange={(e) => update("cta", e.target.value)} /></label>
          <label className="ad-field">Signature / coordonnées<input className="input" value={copy.contact} maxLength={120} onChange={(e) => update("contact", e.target.value)} /></label>
          <div className="ad-colors">
            <label>Bleu nuit <span><input aria-label="Couleur bleu nuit" type="color" value={blue} onChange={(e) => setBlue(e.target.value)} />{blue}</span></label>
            <label>Or <span><input aria-label="Couleur or" type="color" value={gold} onChange={(e) => setGold(e.target.value)} />{gold}</span></label>
          </div>
          <label className="ad-toggle"><input type="checkbox" checked={showServices} onChange={(e) => setShowServices(e.target.checked)} /> Afficher les services</label>
          <div className="ad-actions">
            <button type="button" className="btn btn-primary" onClick={() => window.print()}><Download size={16} /> Exporter en PDF</button>
            <button type="button" className="btn" onClick={reset}><RotateCcw size={16} /> Réinitialiser</button>
          </div>
          <p className="muted ad-hint"><Eye size={14} /> Dans la fenêtre d’impression, choisis « Enregistrer au format PDF » et active les graphiques d’arrière-plan pour conserver les couleurs.</p>
        </section>

        <section className="ad-preview-wrap" aria-label="Aperçu de l’affiche">
          <div className="ad-preview-label"><span><Sparkles size={15} /> APERÇU EN DIRECT</span><span>Format vertical · prêt à imprimer</span></div>
          <article className="ad-poster" style={{ "--ad-blue": blue, "--ad-gold": gold } as React.CSSProperties}>
            <div className="ad-poster-glow" />
            <div className="ad-poster-grid" />
            <header className="ad-brand">
              <div className="ad-brand-mark">B<span>.</span></div>
              <div><strong>BICKRI <em>SERVICE</em></strong><small>AGENCY · DIGITAL EXCELLENCE</small></div>
              <div className="ad-brand-stamp">BSA<br /><span>✦</span></div>
            </header>
            <div className="ad-hero-copy">
              <div className="ad-eyebrow"><span />{copy.eyebrow}</div>
              <h1>{copy.headline.split("\n").map((line, index) => <span key={index}>{line}<br /></span>)}</h1>
              <div className="ad-gold-rule" />
              <p>{copy.description}</p>
              <div className="ad-orbit" aria-hidden="true"><div className="ad-orbit-core">B<span>.</span></div><i /><i /><i /></div>
            </div>
            {showServices && <section className="ad-services"><div className="ad-section-label">NOS EXPERTISES <span>✦</span></div><div className="ad-service-grid">{services.map((service) => <div className="ad-service" key={service.number}><span>{service.number}</span><div><b>{service.title}</b><small>{service.detail}</small></div><i>↗</i></div>)}</div></section>}
            <footer className="ad-footer"><div><span className="ad-footer-cta">{copy.cta}</span><p>{copy.contact}</p></div><div className="ad-footer-arrow">↗</div></footer>
          </article>
        </section>
      </div>

      <style jsx global>{`
        .ad-workspace{display:grid;grid-template-columns:minmax(280px,360px) minmax(0,1fr);gap:22px;align-items:start}
        .ad-controls{display:flex;flex-direction:column;gap:15px}
        .ad-panel-title{display:flex;align-items:center;gap:12px;margin-bottom:4px}.ad-panel-title h2{font-size:17px;margin:0 0 4px}.ad-panel-title p{font-size:12px;margin:0}
        .ad-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:rgba(233,185,94,.12);color:#e9b95e}
        .ad-field{display:flex;flex-direction:column;gap:7px;font-size:12px;font-weight:650}.ad-field .input{font-weight:400;font-size:13px}
        .ad-colors{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ad-colors>label{font-size:12px;font-weight:650;display:flex;flex-direction:column;gap:8px}.ad-colors span{display:flex;align-items:center;gap:7px;font-weight:400;color:var(--muted)}.ad-colors input{width:30px;height:28px;border:0;padding:0;background:transparent;cursor:pointer}
        .ad-toggle{display:flex;align-items:center;gap:9px;font-size:13px}.ad-toggle input{accent-color:#d8a94e;width:16px;height:16px}
        .ad-actions{display:flex;flex-wrap:wrap;gap:8px}.ad-actions .btn{flex:1;justify-content:center;min-height:42px}.ad-hint{display:flex;gap:7px;align-items:flex-start;font-size:11px;line-height:1.5;margin:0}
        .ad-preview-wrap{min-width:0}.ad-preview-label{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:11px;margin:2px 0 10px}.ad-preview-label span:first-child{display:flex;align-items:center;gap:6px;color:#d6a64b;font-weight:750;letter-spacing:.08em}
        .ad-poster{--ad-blue:#07152E;--ad-gold:#E9B95E;position:relative;isolation:isolate;overflow:hidden;width:100%;max-width:760px;aspect-ratio:4/5;margin:0 auto;padding:clamp(20px,4vw,44px);display:flex;flex-direction:column;color:#f7f4ec;background:radial-gradient(ellipse at 82% 23%,color-mix(in srgb,var(--ad-gold) 20%,transparent),transparent 34%),linear-gradient(145deg,var(--ad-blue),#0b2345 55%,#030a16);box-shadow:0 24px 70px rgba(0,0,0,.3);font-family:Arial,Helvetica,sans-serif}
        .ad-poster:before{content:"";position:absolute;inset:12px;border:1px solid color-mix(in srgb,var(--ad-gold) 42%,transparent);pointer-events:none;z-index:-1}
        .ad-poster-glow{position:absolute;width:56%;aspect-ratio:1;right:-15%;top:12%;border:1px solid color-mix(in srgb,var(--ad-gold) 50%,transparent);border-radius:50%;box-shadow:0 0 0 22px color-mix(in srgb,var(--ad-gold) 5%,transparent),0 0 0 55px color-mix(in srgb,var(--ad-gold) 4%,transparent);z-index:-1}
        .ad-poster-grid{position:absolute;inset:0;opacity:.12;background-image:linear-gradient(color-mix(in srgb,var(--ad-gold) 30%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--ad-gold) 30%,transparent) 1px,transparent 1px);background-size:28px 28px;mask-image:linear-gradient(130deg,black,transparent 72%);z-index:-1}
        .ad-brand{display:flex;align-items:center;gap:10px;position:relative}.ad-brand-mark{width:42px;height:42px;display:grid;place-items:center;border:1px solid var(--ad-gold);color:var(--ad-gold);font-size:25px;font-weight:900;font-style:italic}.ad-brand-mark span,.ad-orbit-core span{color:#fff}.ad-brand strong{display:block;font-size:clamp(11px,1.5vw,18px);letter-spacing:.11em}.ad-brand em{font-style:normal;color:var(--ad-gold)}.ad-brand small{display:block;font-size:7px;letter-spacing:.2em;color:#c4cbd5;margin-top:4px}.ad-brand-stamp{margin-left:auto;border:1px solid color-mix(in srgb,var(--ad-gold) 60%,transparent);border-radius:50%;width:44px;height:44px;display:grid;place-content:center;text-align:center;color:var(--ad-gold);font-size:9px;font-weight:800;line-height:1.2;transform:rotate(10deg)}.ad-brand-stamp span{font-size:12px}
        .ad-hero-copy{position:relative;padding-top:clamp(26px,5vw,52px);min-height:39%;}.ad-eyebrow{font-size:clamp(7px,1vw,11px);font-weight:800;letter-spacing:.2em;color:var(--ad-gold);display:flex;align-items:center;gap:8px}.ad-eyebrow span{width:22px;height:2px;background:var(--ad-gold)}
        .ad-hero-copy h1{font-size:clamp(27px,5.2vw,62px);line-height:.99;letter-spacing:-.055em;font-weight:900;margin:17px 0 16px;max-width:82%;position:relative;z-index:2}.ad-hero-copy h1 span:last-child br{display:none}.ad-gold-rule{width:70px;height:3px;background:linear-gradient(90deg,var(--ad-gold),transparent);margin:20px 0 13px}.ad-hero-copy p{font-size:clamp(9px,1.25vw,14px);line-height:1.65;color:#d1d8e3;max-width:67%;position:relative;z-index:2}
        .ad-orbit{position:absolute;right:0;top:27%;width:31%;aspect-ratio:1;border:1px solid color-mix(in srgb,var(--ad-gold) 52%,transparent);border-radius:50%;display:grid;place-items:center;transform:rotate(-20deg)}.ad-orbit:before,.ad-orbit:after{content:"";position:absolute;inset:12%;border:1px solid color-mix(in srgb,var(--ad-gold) 35%,transparent);border-radius:50%}.ad-orbit:after{inset:25%;border-style:dashed}.ad-orbit-core{width:36%;aspect-ratio:1;display:grid;place-items:center;border-radius:50%;background:linear-gradient(145deg,var(--ad-gold),#8d5c20);color:var(--ad-blue);font-size:clamp(17px,3vw,34px);font-weight:900;box-shadow:0 0 35px color-mix(in srgb,var(--ad-gold) 25%,transparent)}.ad-orbit i{position:absolute;width:7px;height:7px;background:var(--ad-gold);border-radius:50%;top:7%;left:46%;box-shadow:0 0 12px var(--ad-gold)}.ad-orbit i:nth-child(2){top:47%;left:93%}.ad-orbit i:nth-child(3){top:87%;left:35%}
        .ad-services{position:relative;margin-top:auto;padding-top:15px}.ad-section-label{display:flex;justify-content:space-between;font-size:9px;letter-spacing:.2em;color:var(--ad-gold);font-weight:800;padding-bottom:10px;border-bottom:1px solid color-mix(in srgb,var(--ad-gold) 35%,transparent)}.ad-service-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}.ad-service{display:flex;align-items:center;gap:8px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.12);min-width:0}.ad-service>span{font-size:9px;color:var(--ad-gold);font-weight:800;align-self:flex-start;padding-top:2px}.ad-service>div{min-width:0;flex:1}.ad-service b{display:block;font-size:clamp(8px,1.05vw,12px);line-height:1.3}.ad-service small{display:block;color:#aeb8c8;font-size:clamp(7px,.8vw,9px);margin-top:4px;line-height:1.35}.ad-service i{font-style:normal;color:var(--ad-gold);font-size:14px}
        .ad-footer{display:flex;align-items:center;gap:12px;justify-content:space-between;margin-top:clamp(16px,2.5vw,26px);padding-top:14px;border-top:1px solid color-mix(in srgb,var(--ad-gold) 45%,transparent);position:relative}.ad-footer-cta{font-size:clamp(8px,1.1vw,12px);font-weight:900;letter-spacing:.04em;color:var(--ad-gold)}.ad-footer p{font-size:clamp(6px,.8vw,9px);color:#c1cad7;letter-spacing:.08em;margin:6px 0 0}.ad-footer-arrow{flex-shrink:0;width:34px;height:34px;border-radius:50%;border:1px solid var(--ad-gold);display:grid;place-items:center;color:var(--ad-gold);font-size:20px}
        @media(max-width:900px){.ad-workspace{grid-template-columns:1fr}.ad-controls{order:2}.ad-preview-wrap{order:1}.ad-poster{max-width:620px}.ad-hero-copy h1{font-size:clamp(30px,7vw,54px)}.ad-hero-copy p{font-size:clamp(10px,2vw,13px)}.ad-service b{font-size:clamp(9px,1.6vw,12px)}.ad-service small{font-size:clamp(7px,1.2vw,9px)}}
        @media(max-width:480px){.ad-poster{padding:22px 20px}.ad-poster:before{inset:8px}.ad-brand-mark{width:34px;height:34px;font-size:20px}.ad-brand-stamp{width:34px;height:34px;font-size:7px}.ad-brand strong{font-size:10px}.ad-brand small{font-size:6px}.ad-hero-copy{padding-top:28px}.ad-hero-copy h1{font-size:clamp(27px,8vw,38px);max-width:88%}.ad-orbit{right:-2%;width:28%;top:34%}.ad-hero-copy p{max-width:72%;font-size:9px}.ad-service{gap:5px;padding:9px 0}.ad-service-grid{gap:0 8px}.ad-service b{font-size:8px}.ad-service small{font-size:7px}.ad-footer-arrow{width:27px;height:27px}.ad-footer p{letter-spacing:0;font-size:6px}}
        @media print{@page{size:A4 portrait;margin:0}.ad-studio> :not(.ad-workspace){display:none!important}body{background:#fff!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.ad-workspace{display:block!important}.ad-controls,.ad-preview-label{display:none!important}.ad-preview-wrap{width:100%!important}.ad-poster{width:100%!important;max-width:none!important;height:100vh!important;aspect-ratio:auto!important;box-shadow:none!important;padding:14mm!important;page-break-inside:avoid}.ad-poster:before{inset:5mm}.ad-hero-copy{padding-top:14mm}.ad-hero-copy h1{font-size:42pt}.ad-hero-copy p{font-size:10pt}.ad-service b{font-size:9pt}.ad-service small{font-size:7pt}.ad-footer-cta{font-size:9pt}}
      `}</style>
    </main>
  );
}
