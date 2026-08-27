import { ref } from 'vue';

export function useSpeech() {
  const listening = ref(false);
  const transcript = ref('');
  const supported = ref(
    typeof window !== 'undefined' &&
      Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  );

  let recognition: SpeechRecognition | null = null;

  function start(onFinal?: (text: string) => void, opts?: { continuous?: boolean }) {
    if (!supported.value) return;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;
    recognition?.stop();
    recognition = new Ctor();
    recognition.lang = 'es-ES';
    recognition.continuous = Boolean(opts?.continuous);
    recognition.interimResults = true;
    listening.value = true;
    let finalBuffer = '';
    recognition.onresult = (ev) => {
      let interim = '';
      for (let i = 0; i < ev.results.length; i++) {
        const piece = ev.results[i]![0]?.transcript || '';
        if (ev.results[i]!.isFinal) finalBuffer += `${piece} `;
        else interim += piece;
      }
      transcript.value = `${finalBuffer}${interim}`.replace(/\s+/g, ' ').trim();
      const last = ev.results[ev.results.length - 1];
      if (last?.isFinal && onFinal && !opts?.continuous) onFinal(transcript.value);
    };
    recognition.onerror = () => {
      listening.value = false;
    };
    recognition.onend = () => {
      listening.value = false;
      if (opts?.continuous && onFinal && transcript.value) onFinal(transcript.value.trim());
    };
    recognition.start();
  }

  function stop() {
    recognition?.stop();
    listening.value = false;
  }

  return { listening, transcript, supported, start, stop };
}
