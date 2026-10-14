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
    <span className="inline-voice" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <label className="sr-only" htmlFor="bcx-voice-language">Langue vocale</label>
      <select
        id="bcx-voice-language"
        className="select"
        style={{ width: 105, minWidth: 0, height: 30, fontSize: "var(--text-xs)", padding: "0 6px" }}
        value={locale}
        onChange={(event) => setLocale(event.target.value)}
        disabled={listening || speaking}
        aria-label="Langue vocale"
      >
        {LOCALES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      {!voiceMode ? (
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={() => { setVoiceMode(true); voiceModeRef.current = true; setNotice("Activation du microphone…"); startListening(); }}
          disabled={busy || blocked}
          aria-label="Démarrer la conversation vocale"
          title="Parler à BICKRI AI"
        >
          <Mic size={20} aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          className={`btn btn-icon ${listening ? "btn-primary" : speaking ? "btn-plugins-on" : "btn-danger"}`}
          onClick={stopVoice}
          aria-label="Arrêter la conversation vocale"
          title={listening ? "Écoute active — toucher pour arrêter" : speaking ? "BICKRI AI parle — toucher pour arrêter" : "Arrêter le mode vocal"}
        >
          {listening ? <Radio size={20} aria-hidden="true" /> : speaking ? <Volume2 size={20} aria-hidden="true" /> : <MicOff size={20} aria-hidden="true" />}
        </button>
      )}
      <span className="sr-only" role="status" aria-live="polite">{blocked ? "Validation humaine requise avant de continuer." : notice}</span>
    </span>
  );
}
