"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Radio, Volume2 } from "lucide-react";

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

type SpeechRecognitionAlternativeLike = { transcript: string };
type SpeechRecognitionResultLike = ArrayLike<SpeechRecognitionAlternativeLike> & { isFinal?: boolean };
type SpeechRecognitionEventLike = {
  results: ArrayLike<SpeechRecognitionResultLike>;
};
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event?: { error?: string }) => void) | null;
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
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onSendRef = useRef(onSend);
  const voiceModeRef = useRef(voiceMode);
  const blockedRef = useRef(blocked);
  const busyRef = useRef(busy);
  const waitingForResponseRef = useRef(false);
  const lastSpokenRef = useRef("");
  const previousBusyRef = useRef(busy);
  const startInProgressRef = useRef(false);
  const recognitionActiveRef = useRef(false);
  const submittedThisSessionRef = useRef(false);
  const cancelledSpeechRef = useRef(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => { onSendRef.current = onSend; }, [onSend]);
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  useEffect(() => { blockedRef.current = blocked; }, [blocked]);
  useEffect(() => { busyRef.current = busy; }, [busy]);

  const startListening = useCallback(async () => {
    if (startInProgressRef.current || recognitionActiveRef.current) return;
    if (!voiceModeRef.current || blockedRef.current || busyRef.current) return;
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
    if (!window.isSecureContext) {
      setNotice("Le micro exige une connexion HTTPS sécurisée. Ouvre BCX avec son adresse HTTPS.");
      voiceModeRef.current = false;
      setVoiceMode(false);
      return;
    }
    startInProgressRef.current = true;
    let stream: MediaStream | null = null;
    try {
      setNotice("Vérification de l'accès au microphone…");
      // Request microphone access explicitly before starting SpeechRecognition.
      // Some Android browsers otherwise report a generic not-allowed error.
      if (!navigator.mediaDevices?.getUserMedia) {
        setNotice("Ce navigateur ne permet pas d'ouvrir le microphone. Mets Chrome à jour.");
        voiceModeRef.current = false;
        setVoiceMode(false);
        return;
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
      if (!voiceModeRef.current || blockedRef.current || busyRef.current) return;
      window.speechSynthesis?.cancel();
      recognition.lang = locale;
      submittedThisSessionRef.current = false;
      setTranscript("");
      recognition.start();
      recognitionActiveRef.current = true;
      setListening(true);
      setSpeaking(false);
      setNotice("J'écoute… parle naturellement, puis fais une courte pause.");
    } catch (error) {
      setListening(false);
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setNotice("Le navigateur ou le téléphone bloque le micro pour BCX. Autorise-le pour ce site, puis recharge la page.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setNotice("Aucun microphone n'a été détecté sur cet appareil.");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setNotice("Le micro est utilisé par une autre application. Ferme-la puis réessaie.");
      } else {
        setNotice(`Impossible de démarrer le micro (${name || "erreur inconnue"}). Réessaie.`);
      }
      voiceModeRef.current = false;
      setVoiceMode(false);
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      startInProgressRef.current = false;
    }
  }, [locale]);

  const stopVoice = useCallback(() => {
    voiceModeRef.current = false;
    setVoiceMode(false);
    setListening(false);
    waitingForResponseRef.current = false;
    startInProgressRef.current = false;
    recognitionActiveRef.current = false;
    cancelledSpeechRef.current = true;
    utteranceRef.current = null;
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
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.lang = locale;
    recognition.onresult = (event) => {
      const parts: string[] = [];
      let isFinal = false;
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const phrase = result?.[0]?.transcript?.trim();
        if (phrase) parts.push(phrase);
        if (index === event.results.length - 1 && result?.isFinal) isFinal = true;
      }
      const transcript = parts.join(" ").replace(/\s+/g, " ").trim();
      setTranscript(transcript);
      if (!isFinal || !transcript || submittedThisSessionRef.current) return;
      submittedThisSessionRef.current = true;
      setListening(false);
      setNotice(`Commande reconnue : « ${transcript.slice(0, 180)} »`);
      lastSpokenRef.current = "";
      waitingForResponseRef.current = true;
      Promise.resolve(onSendRef.current(transcript)).catch(() => {
        waitingForResponseRef.current = false;
        setNotice("L'envoi a échoué. Je relance l'écoute…");
        if (voiceModeRef.current && !blockedRef.current) {
          window.setTimeout(() => {
            if (voiceModeRef.current && !blockedRef.current) startListening();
          }, 500);
        }
      });
    };
    recognition.onerror = (event?: { error?: string }) => {
      recognitionActiveRef.current = false;
      setListening(false);
      const reason = event?.error;
      if (reason === "not-allowed" || reason === "service-not-allowed") {
        voiceModeRef.current = false;
        setVoiceMode(false);
        setNotice("Accès au microphone refusé. Autorise le microphone dans les paramètres du navigateur, puis réessaie.");
      } else if (reason === "no-speech") {
        setNotice("Je n'ai rien entendu. Je relance l'écoute…");
        if (voiceModeRef.current && !blockedRef.current) {
          window.setTimeout(() => {
            if (voiceModeRef.current && !blockedRef.current) startListening();
          }, 500);
        }
      } else if (reason === "audio-capture") {
        setNotice("Aucun microphone disponible. Vérifie que ton téléphone autorise l'accès au micro.");
      } else if (reason === "network") {
        setNotice("Le service de reconnaissance vocale est inaccessible. Vérifie Internet puis réessaie.");
      } else if (reason === "aborted") {
        setNotice("Écoute interrompue. Appuie sur le micro pour recommencer.");
      } else {
        setNotice(`La reconnaissance vocale a échoué (${reason ?? "erreur inconnue"}). Vérifie Internet et les autorisations du micro.`);
      }
    };
    recognition.onend = () => {
      recognitionActiveRef.current = false;
      setListening(false);
    };
    recognitionRef.current = recognition;

    return () => {
      recognitionActiveRef.current = false;
      try { recognition.stop(); } catch { /* déjà arrêté */ }
      if (recognitionRef.current === recognition) recognitionRef.current = null;
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
    cancelledSpeechRef.current = false;
    const utterance = new SpeechSynthesisUtterance(clean);
    utteranceRef.current = utterance;
    utterance.lang = locale;
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onstart = () => {
      setSpeaking(true);
      setNotice("BICKRI AI répond à voix haute…");
    };
    utterance.onerror = (event) => {
      if (utteranceRef.current !== utterance) return;
      utteranceRef.current = null;
      setSpeaking(false);
      if (!cancelledSpeechRef.current && event.error !== "canceled" && event.error !== "interrupted") {
        setNotice("La lecture vocale a échoué. Tu peux lire la réponse à l'écran.");
      }
    };
    utterance.onend = () => {
      if (utteranceRef.current !== utterance) return;
      utteranceRef.current = null;
      setSpeaking(false);
      if (cancelledSpeechRef.current) return;
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
    <span className="row" style={{ gap: 4, flexShrink: 0 }}>
      <label className="sr-only" htmlFor="bcx-voice-language">Langue vocale</label>
      <select
        id="bcx-voice-language"
        className="select"
        style={{ width: 1, minWidth: 1, height: 1, padding: 0, border: 0, opacity: 0, position: "absolute", pointerEvents: "none" }}
        value={locale}
        onChange={(event) => setLocale(event.target.value)}
        disabled={listening || speaking}
        tabIndex={-1}
        aria-hidden="true"
      >
        {LOCALES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      {!voiceMode ? (
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          onClick={() => { setVoiceMode(true); voiceModeRef.current = true; setNotice("Activation du microphone…"); startListening(); }}
          disabled={busy || blocked}
          aria-label="Parler à BICKRI AI"
          title="Parler à BICKRI AI"
        >
          <Mic size={18} aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          className={`btn btn-icon btn-sm ${listening ? "btn-primary" : "btn-danger"}`}
          onClick={stopVoice}
          aria-label="Arrêter la conversation vocale"
          title={listening ? "Écoute active — appuie pour arrêter" : speaking ? "BICKRI AI parle — appuie pour arrêter" : "Arrêter le mode vocal"}
        >
          {listening ? <Radio size={18} aria-hidden="true" /> : speaking ? <Volume2 size={18} aria-hidden="true" /> : <MicOff size={18} aria-hidden="true" />}
        </button>
      )}
      {speaking && (
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => {
          cancelledSpeechRef.current = true;
          utteranceRef.current = null;
          if (typeof window !== "undefined") window.speechSynthesis?.cancel();
          setSpeaking(false);
          setNotice("Lecture vocale interrompue.");
        }} aria-label="Couper la réponse vocale" title="Couper la voix">
          <Volume2 size={17} aria-hidden="true" />
        </button>
      )}
      <span
        role="status"
        aria-live="polite"
        style={{
          display: notice || transcript ? "inline-block" : "none",
          maxWidth: 230,
          fontSize: 11,
          lineHeight: 1.35,
          color: "var(--muted-foreground, #64748b)",
          overflowWrap: "anywhere",
        }}
      >
        {blocked ? "Une action nécessite ton approbation. Confirme-la dans la conversation." : <>{notice}{transcript && <><br /><strong>Transcription :</strong> {transcript}</>}</>}
      </span>
    </span>
  );
}
