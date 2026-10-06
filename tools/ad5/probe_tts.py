# Can Indic Parler-TTS (expressive, Urdu) run on the CPU runner?
import torch, time, soundfile as sf
from parler_tts import ParlerTTSForConditionalGeneration
from transformers import AutoTokenizer
m = "ai4bharat/indic-parler-tts"
t0 = time.time()
model = ParlerTTSForConditionalGeneration.from_pretrained(m)
tok = AutoTokenizer.from_pretrained(m); dtok = AutoTokenizer.from_pretrained(model.config.text_encoder._name_or_path)
print("loaded", time.time() - t0, flush=True)
tests = [("abbu", "یہ کیبل کا بل... پھر سے ایک سو بیس ڈالر!", "Rohit speaks in a shocked, exasperated tone with a moderate pace. The recording is very high quality, close-sounding, with no background noise."),
         ("dadi", "واہ! کرکٹ بھی، اور میرا ڈرامہ بھی!", "An elderly female speaker speaks with great joy and excitement, laughing. The recording is very high quality, close-sounding, with no background noise.")]
for n, text, desc in tests:
    t0 = time.time()
    d = dtok(desc, return_tensors="pt"); p = tok(text, return_tensors="pt")
    with torch.no_grad():
        a = model.generate(input_ids=d.input_ids, attention_mask=d.attention_mask, prompt_input_ids=p.input_ids, prompt_attention_mask=p.attention_mask)
    sf.write(f"out/tts-{n}.wav", a.cpu().numpy().squeeze(), model.config.sampling_rate)
    print("tts", n, time.time() - t0, flush=True)
