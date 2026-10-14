"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Radio, Volume2, VolumeX } from "lucide-react";

type LocaleOption = { label: string; value: string };

const LOCALES: LocaleOption[] = [
  { label: "Français", value: "fr-FR" },
  { label: "English", value: "en-US" },
  { label: "العربية", value: "ar-SA" },
  { label: "Hausa", value: "ha-NG" },
  { label: "Zarma (français)", value: "fr-NE" },
  { label: "Español", value: "es-ES" },
  { label: "Português", value: "pt-PT" },
];

type SpeechRecognitionResultLike = { transcript: string };
type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>;
};
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

type VoiceAssistantProps = {
  onSend: (transcript: string) => void | Promise<void>;
  assistantResponse: string;
  busy: boolean;
  blocked: boolean;
};

function speechSafeText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " Un bloc de code a été fourni. ")
    .replace(/`([^\`]+)`/g, "$1")
    .replace(/https?:\/\/\S+/g, " un lien ")
    .replace(/[#>*_~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);
}

export function VoiceAssistant({
  onSend,
  assistantResponse,
  busy,
  blocked,
}: VoiceAssistantProps) {
  const [locale, setLocale] = useState("fr-FR");
  const [voiceMode, setVoiceMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [notice, setNotice] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onSendRef = useRef(onSend);
  const voiceModeRef = useRef(voiceMode);
  const blockedRef = useRef(blocked);
  const waitingForResponseRef = useRef(false);
  const lastSpokenRef = useRef("");
  const previousBusyRef = useRef(busy);

  useEffect(() => { onSendRef.current = onSend; }, [onSend]);
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  useEffect(() => { blockedRef.current = blocked; }, [blocked]);

  const startListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setNotice("La reconnaissance vocale n'est pas prise en charge par ce navigateur. Essaie Chrome récent.");
      voiceModeRef.current = false;
      setVoiceMode(false);
      return;
    }
    if (blockedRef.current) {
      setNotice("Valide ou refuse d'abord l'action en attente dans la conversation.");
      return;
    }
    try {
      window.speechSynthesis?.cancel();
      recognition.lang = locale;
      recognition.start();
      setListening(true);
      setSpeaking(false);
      setNotice("J'écoute… parle naturellement, puis fais une courte pause.");
    } catch {
      setListening(false);
      setNotice("Le microphone est déjà actif ou n'a pas pu démarrer. Réessaie.");
    }
  }, [locale]);

  const stopVoice = useCallback(() => {
    voiceModeRef.current = false;
    setVoiceMode(false);
    setListening(false);
    waitingForResponseRef.current = false;
    try { recognitionRef.current?.stop(); } catch { /* déjà arrêté */ }
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setSpeaking(false);
    setNotice("Mode vocal arrêté.");
  }, []);

  useEffect(() => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setNotice("Reconnaissance vocale indisponible ici. Utilise un navigateur compatible.");
      return;
    }

    const recognition = new Recognition();
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.lang = locale;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      setListening(false);
      if (!transcript) {
        setNotice("Je n'ai pas reconnu de phrase. Tu peux réessayer.");
        return;
      }
      setNotice(`Commande reconnue : « ${transcript.slice(0, 180)} »`);
      lastSpokenRef.current = "";
      waitingForResponseRef.current = true;
      void onSendRef.current(transcript);
    };
    recognition.onerror = (event?: { error?: string }) => {
      setListening(false);
      const reason = event?.error;
      if (reason === "not-allowed" || reason === "service-not-allowed") {
        voiceModeRef.current = false;
        setVoiceMode(false);
        setNotice("Accès au microphone refusé. Autorise le microphone dans les paramètres du navigateur, puis réessaie.");
      } else if (reason === "no-speech") {
        setNotice("Je n'ai rien entendu. Parle après le signal d'écoute, puis réessaie.");
      } else if (reason === "audio-capture") {
        setNotice("Aucun microphone disponible. Vérifie que ton téléphone autorise l'accès au micro.");
      } else {
        setNotice("La reconnaissance vocale a échoué. Vérifie la connexion et les permissions du microphone.");
      }
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;

    return () => {
      try { recognition.stop(); } catch { /* déjà arrêté */ }
    };
  }, [locale]);

  useEffect(() => {
    if (blocked) {
      waitingForResponseRef.current = false;
      if (voiceModeRef.current) {
        voiceModeRef.current = false;
        setVoiceMode(false);
        try { recognitionRef.current?.stop(); } catch { /* déjà arrêté */ }
        window.speechSynthesis?.cancel();
        setListening(false);
        setSpeaking(false);
        setNotice("Validation humaine requise : approuve ou refuse l'action dans la conversation.");
      }
    }
  }, [blocked]);

  useEffect(() => {
    const clean = speechSafeText(assistantResponse);
    // If the request ends without an assistant response, release the voice loop
    // instead of leaving it waiting forever (for example after a network/API error).
    const wasBusy = previousBusyRef.current;
    previousBusyRef.current = busy;
    if (wasBusy && !busy && waitingForResponseRef.current && !clean && !blocked) {
      waitingForResponseRef.current = false;
      setNotice("Je n'ai pas reçu de réponse. Je relance l'écoute…");
      if (voiceModeRef.current) {
        window.setTimeout(() => {
          if (voiceModeRef.current && !blockedRef.current) startListening();
        }, 500);
      }
      return;
    }
    if (!voiceMode || !waitingForResponseRef.current || busy || blocked || !clean || clean === lastSpokenRef.current) return;
    if (!("speechSynthesis" in window)) {
      setNotice("La lecture vocale n'est pas prise en charge par ce navigateur.");
      waitingForResponseRef.current = false;
      return;
    }

    waitingForResponseRef.current = false;
    lastSpokenRef.current = clean;
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = locale;
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onstart = () => {
      setSpeaking(true);
      setNotice("BICKRI AI répond à voix haute…");
    };
    utterance.onerror = () => {
      setSpeaking(false);
      setNotice("La lecture vocale a échoué. Tu peux lire la réponse à l'écran.");
    };
    utterance.onend = () => {
      setSpeaking(false);
      if (voiceModeRef.current && !blockedRef.current) {
        setNotice("À toi : je t'écoute de nouveau.");
        window.setTimeout(() => {
          if (voiceModeRef.current && !blockedRef.current) startListening();
        }, 250);
      } else {
        setNotice("Réponse terminée.");
      }
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [assistantResponse, blocked, busy, locale, startListening, voiceMode]);

  return (
    <section className="card card-pad" aria-label="Assistant vocal BICKRI AI" style={{ marginBottom: 10, display: "grid", gap: 10 }}>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <div className="row grow" style={{ gap: 8 }}>
          <span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 10, background: "var(--accent-soft)", color: "var(--accent)" }}>
            <Radio size={18} aria-hidden="true" />
          </span>
          <div>
            <strong style={{ display: "block" }}>Conversation vocale</strong>
            <small className="muted">Parle à BICKRI AI, écoute sa réponse et reprends la conversation.</small>
          </div>
        </div>
        <label className="row" style={{ gap: 8, fontSize: "var(--text-sm)" }}>
          <span className="muted">Langue</span>
          <select className="select" style={{ width: 155 }} value={locale} onChange={(event) => setLocale(event.target.value)} disabled={listening || speaking} aria-label="Langue de reconnaissance et de lecture">
            {LOCALES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        {!voiceMode ? (
          <button type="button" className="btn btn-primary" onClick={() => { setVoiceMode(true); voiceModeRef.current = true; setNotice("Activation du mode vocal…"); startListening(); }} disabled={busy || blocked}>
            <Mic size={15} /> Démarrer le mode vocal
          </button>
        ) : (
          <button type="button" className="btn btn-danger" onClick={stopVoice}>
            <MicOff size={15} /> Arrêter
          </button>
        )}
        <button type="button" className="btn" onClick={() => {
          if (typeof window !== "undefined") window.speechSynthesis?.cancel();
          setSpeaking(false);
          setNotice("Lecture vocale interrompue.");
        }} disabled={!speaking}>
          <VolumeX size={15} /> Couper la voix
        </button>
        {speaking && <span className="badge badge-accent"><Volume2 size={12} /> Réponse audio</span>}
        {listening && <span className="badge badge-success"><Mic size={12} /> Écoute active</span>}
      </div>
      <p className="muted" role="status" aria-live="polite" style={{ fontSize: "var(--text-xs)" }}>
        {blocked ? "Une action nécessite ton approbation. Le mode vocal s'arrête pour éviter toute validation accidentelle." : notice || "Le microphone ne s'active qu'après ton clic. Les modifications de code restent soumises à confirmation."}
      </p>
    </section>
  );
}
