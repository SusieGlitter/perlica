"""Generate the original Wuling cycling soundtrack used by this project.

The composition is synthesized entirely in Python and contains no sampled
third-party recordings. It uses a sparse D minor pentatonic theme, plucked
strings, a breathy flute, bowed low strings, framed drums, metal accents, and
the recurring bell motif associated with Wuling's old city.
"""

from __future__ import annotations

import math
import wave
from pathlib import Path

import numpy as np


SAMPLE_RATE = 44_100
BPM = 72
BEAT = 60 / BPM
BAR = BEAT * 4
BARS = 34
DURATION = BAR * BARS
SAMPLES = int(DURATION * SAMPLE_RATE)

OUTPUT = Path(__file__).resolve().parents[1] / "public" / "assets" / "audio" / "wuling-cloudway.wav"

SCALE = {
    "D2": 73.42,
    "F2": 87.31,
    "G2": 98.00,
    "A2": 110.00,
    "C3": 130.81,
    "D3": 146.83,
    "E3": 164.81,
    "F3": 174.61,
    "G3": 196.00,
    "A3": 220.00,
    "C4": 261.63,
    "D4": 293.66,
    "E4": 329.63,
    "F4": 349.23,
    "G4": 392.00,
    "A4": 440.00,
    "C5": 523.25,
    "D5": 587.33,
    "F5": 698.46,
}


def envelope(
    length: int,
    attack: float,
    decay: float,
    release: float,
    sustain: float = 0.55,
) -> np.ndarray:
    attack_n = min(length, max(1, int(attack * SAMPLE_RATE)))
    decay_n = min(length - attack_n, max(1, int(decay * SAMPLE_RATE)))
    release_n = min(length - attack_n - decay_n, max(1, int(release * SAMPLE_RATE)))
    sustain_n = max(0, length - attack_n - decay_n - release_n)
    return np.concatenate(
        (
            np.linspace(0, 1, attack_n, endpoint=False),
            np.linspace(1, sustain, decay_n, endpoint=False),
            np.full(sustain_n, sustain),
            np.linspace(sustain, 0, release_n),
        ),
    )[:length]


def add(buffer: np.ndarray, start: float, sample: np.ndarray, pan: float = 0.0) -> None:
    index = int(start * SAMPLE_RATE)
    if index >= len(buffer):
        return
    sample = sample[: len(buffer) - index]
    left_gain = math.sqrt((1 - pan) * 0.5)
    right_gain = math.sqrt((1 + pan) * 0.5)
    buffer[index : index + len(sample), 0] += sample * left_gain
    buffer[index : index + len(sample), 1] += sample * right_gain


def guqin(frequency: float, duration: float, velocity: float = 1.0) -> np.ndarray:
    length = int(duration * SAMPLE_RATE)
    rng = np.random.default_rng(int(frequency * 917 + length))
    delay = max(2, int(SAMPLE_RATE / frequency))
    signal = rng.uniform(-1, 1, length)
    signal[: min(8, length)] *= np.linspace(0.2, 1, min(8, length))
    for index in range(delay, length):
        bridge_loss = 0.9972 - 0.00000045 * frequency
        signal[index] = bridge_loss * (
            0.54 * signal[index - delay]
            + 0.32 * signal[index - delay + 1]
            + 0.14 * signal[index - delay - 1]
        )
    signal *= np.exp(-np.arange(length) / SAMPLE_RATE * (2.2 + frequency * 0.0018))
    signal = np.convolve(signal, np.array([0.88, 0.1, 0.02]), mode="same")
    signal += 0.16 * np.sin(2 * np.pi * frequency * np.arange(length) / SAMPLE_RATE)
    signal *= envelope(length, 0.004, 0.035, 0.34, sustain=0.46)
    return signal * 0.22 * velocity


def flute(frequency: float, duration: float, velocity: float = 1.0) -> np.ndarray:
    length = int(duration * SAMPLE_RATE)
    t = np.arange(length) / SAMPLE_RATE
    vibrato = 1 + 0.0055 * np.sin(2 * np.pi * 4.35 * t + 0.7)
    phase = 2 * np.pi * frequency * np.cumsum(vibrato) / SAMPLE_RATE
    tone = (
        np.sin(phase)
        + 0.16 * np.sin(phase * 2)
        + 0.045 * np.sin(phase * 3)
        + 0.018 * np.sin(phase * 5)
    )
    breath = np.random.default_rng(int(frequency * 313 + length)).normal(0, 0.09, length)
    breath = np.convolve(breath, np.ones(57) / 57, mode="same")
    breath *= 0.7 + 0.3 * np.sin(2 * np.pi * 1.3 * t)
    signal = tone * 0.17 + breath * 0.025
    signal *= envelope(length, 0.12, 0.06, 0.32, sustain=0.7)
    return signal * 0.34 * velocity


def bowed_string(frequency: float, duration: float, velocity: float = 1.0) -> np.ndarray:
    length = int(duration * SAMPLE_RATE)
    t = np.arange(length) / SAMPLE_RATE
    resonance = 1 + 0.0018 * np.sin(2 * np.pi * 0.17 * t)
    signal = (
        np.sin(2 * np.pi * frequency * resonance * t)
        + 0.28 * np.sin(2 * np.pi * frequency * 2.004 * t + 0.3)
        + 0.1 * np.sin(2 * np.pi * frequency * 3.01 * t + 0.9)
    )
    signal *= envelope(length, 0.75, 0.45, 0.95, sustain=0.67)
    return signal * 0.07 * velocity


def bass(frequency: float, duration: float, velocity: float = 1.0) -> np.ndarray:
    length = int(duration * SAMPLE_RATE)
    t = np.arange(length) / SAMPLE_RATE
    signal = np.sin(2 * np.pi * frequency * t)
    signal += 0.2 * np.sin(2 * np.pi * frequency * 2 * t)
    signal += 0.06 * np.sin(2 * np.pi * frequency * 0.5 * t)
    signal *= envelope(length, 0.035, 0.16, 0.32, sustain=0.52)
    return signal * 0.18 * velocity


def bell(frequency: float, duration: float, velocity: float = 1.0) -> np.ndarray:
    length = int(duration * SAMPLE_RATE)
    t = np.arange(length) / SAMPLE_RATE
    partials = (
        (1.0, 0.52),
        (2.01, 0.23),
        (2.72, 0.12),
        (3.97, 0.1),
        (5.41, 0.05),
        (7.03, 0.025),
    )
    signal = np.zeros(length)
    for ratio, amplitude in partials:
        signal += amplitude * np.sin(2 * np.pi * frequency * ratio * t)
    signal *= np.exp(-t * (1.35 + frequency * 0.0008))
    signal *= envelope(length, 0.004, 0.1, 0.32)
    return signal * 0.18 * velocity


def frame_drum(frequency: float = 68.0, duration: float = 0.7) -> np.ndarray:
    length = int(duration * SAMPLE_RATE)
    t = np.arange(length) / SAMPLE_RATE
    body_frequency = frequency * np.exp(-t * 14) + frequency * 0.52
    phase = 2 * np.pi * np.cumsum(body_frequency) / SAMPLE_RATE
    body = np.sin(phase) * np.exp(-t * 9)
    skin = np.random.default_rng(741).normal(0, 0.36, length)
    skin = np.convolve(skin, np.ones(30) / 30, mode="same")
    skin *= np.exp(-t * 15)
    return (body * 0.56 + skin) * 0.31


def woodblock(frequency: float = 760.0, duration: float = 0.18) -> np.ndarray:
    length = int(duration * SAMPLE_RATE)
    t = np.arange(length) / SAMPLE_RATE
    signal = (
        np.sin(2 * np.pi * frequency * t)
        + 0.38 * np.sin(2 * np.pi * frequency * 1.51 * t)
    )
    noise = np.random.default_rng(int(frequency)).normal(0, 0.12, length)
    signal += noise
    return signal * np.exp(-t * 22) * 0.075


def metal_accent(duration: float = 2.8) -> np.ndarray:
    length = int(duration * SAMPLE_RATE)
    t = np.arange(length) / SAMPLE_RATE
    signal = (
        np.sin(2 * np.pi * 1220 * t)
        + 0.42 * np.sin(2 * np.pi * 1847 * t + 0.3)
        + 0.24 * np.sin(2 * np.pi * 2530 * t + 1.1)
        + 0.17 * np.sin(2 * np.pi * 3407 * t + 0.8)
    )
    return signal * np.exp(-t * 2.4) * 0.045


def add_delay(buffer: np.ndarray) -> np.ndarray:
    delay = int(0.46 * SAMPLE_RATE)
    wet = np.zeros_like(buffer)
    wet[delay:] += buffer[:-delay] * 0.2
    for repeat in range(1, 4):
        offset = delay * repeat
        wet[offset:] += buffer[:-offset] * (0.09 / repeat)
    wet = np.convolve(wet[:, 0], np.ones(19) / 19, mode="same"), np.convolve(
        wet[:, 1],
        np.ones(23) / 23,
        mode="same",
    )
    return buffer + np.column_stack(wet) * 0.52


def build_track() -> np.ndarray:
    buffer = np.zeros((SAMPLES, 2), dtype=np.float64)
    chord_roots = ("D3", "A2", "F3", "G3")
    theme = (
        "D4", "F4", "A4", "G4", "F4", "D4", "C4", "D4",
        "F4", "G4", "A4", "C5", "A4", "G4", "F4", "D4",
        "D4", "F4", "G4", "A4", "C5", "A4", "G4", "F4",
        "E4", "F4", "G4", "F4", "D4", "C4", "D4", "D4",
    )
    counterline = (
        "D3", "F3", "A3", "C4", "A3", "G3", "F3", "G3",
        "A3", "C4", "D4", "C4", "A3", "G3", "F3", "A3",
    )
    rng = np.random.default_rng(9127)

    for bar in range(BARS):
        start = bar * BAR
        section = (
            "dawn"
            if bar < 5
            else "approach"
            if bar < 9
            else "theme"
            if bar < 21
            else "cloud"
            if bar < 27
            else "return"
        )
        root = chord_roots[(bar // 3) % len(chord_roots)]
        velocity = 0.86 + rng.uniform(-0.08, 0.1)

        if section != "dawn":
            add(buffer, start, bowed_string(SCALE[root] * 0.5, BAR * 1.08, velocity), -0.14)
            add(
                buffer,
                start,
                bowed_string(SCALE[root] * 0.75, BAR * 1.08, velocity * 0.84),
                0.16,
            )

        if section in ("approach", "theme", "return"):
            for beat_index in range(4):
                note = ("D2", "D2", "A2", "F2")[(bar + beat_index) % 4]
                add(
                    buffer,
                    start + beat_index * BEAT,
                    bass(SCALE[note], BEAT * (0.82 if beat_index else 1.2), velocity),
                )
            add(buffer, start, frame_drum(62, 0.8))
            add(buffer, start + BEAT * 2, frame_drum(55, 0.95), -0.08)
            add(buffer, start + BEAT * 3.5, frame_drum(76, 0.55), 0.12)
            if bar % 2 == 1:
                add(buffer, start + BEAT * 1.5, woodblock(820, 0.14), 0.22)
                add(buffer, start + BEAT * 3.5, woodblock(680, 0.16), -0.22)

        if section in ("approach", "theme", "return"):
            for step in range(8):
                note = counterline[(bar * 2 + step) % len(counterline)]
                if (bar + step) % 3 == 0:
                    continue
                when = start + step * BEAT * 0.5 + rng.uniform(-0.008, 0.008)
                pan = -0.24 if step % 2 else 0.24
                add(buffer, when, guqin(SCALE[note], BEAT * 1.1, 0.75 + rng.uniform(0, 0.2)), pan)

        if 4 <= bar < 31:
            phrase_index = ((bar - 4) * 2) % len(theme)
            note = theme[phrase_index]
            if section == "cloud":
                if bar % 2 == 0:
                    add(buffer, start + BEAT * 0.5, flute(SCALE[note], BEAT * 2.3, 0.72), -0.08)
            else:
                add(buffer, start + BEAT * 0.25, flute(SCALE[note], BEAT * 1.8, velocity), 0.14)
                if section in ("theme", "return") and bar % 4 == 3:
                    add(
                        buffer,
                        start + BEAT * 2.25,
                        flute(SCALE[theme[(phrase_index + 2) % len(theme)]], BEAT * 1.25, 0.78),
                        0.1,
                    )

        if bar in (0, 4, 9, 17, 26, 32):
            add(buffer, start, bell(SCALE["D3"], 6.5, 1.05), -0.26)
            add(buffer, start + 0.06, bell(SCALE["A3"], 5.1, 0.52), 0.26)
        if bar in (8, 16, 20, 25, 31):
            add(buffer, start + BEAT * 2.5, bell(SCALE["D4"], 4.4, 0.68), 0.12)
        if bar in (11, 15, 23, 29):
            add(buffer, start + BEAT * 3.25, metal_accent(2.4), -0.18)

    ambient_length = SAMPLES
    t = np.arange(ambient_length) / SAMPLE_RATE
    low_drone = (
        np.sin(2 * np.pi * 36.71 * t)
        + 0.16 * np.sin(2 * np.pi * 55.0 * t + 0.4)
    )
    low_drone *= 0.009 * (0.72 + 0.28 * np.sin(2 * np.pi * 0.018 * t))
    air = rng.normal(0, 0.08, ambient_length)
    air = np.convolve(air, np.ones(480) / 480, mode="same")
    air *= 0.12 + 0.035 * np.sin(2 * np.pi * 0.03 * t + 0.8)
    buffer += np.column_stack((low_drone + air, low_drone + np.roll(air, 137)))

    buffer = add_delay(buffer)
    fade = int(3.2 * SAMPLE_RATE)
    buffer[:fade] *= np.linspace(0, 1, fade)[:, None]
    buffer[-fade:] *= np.linspace(1, 0, fade)[:, None]
    peak = np.max(np.abs(buffer))
    if peak:
        buffer *= 0.9 / peak
    return buffer.astype(np.float32)


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    track = build_track()
    pcm = np.clip(track * 32767, -32768, 32767).astype("<i2")
    with wave.open(str(OUTPUT), "wb") as handle:
        handle.setnchannels(2)
        handle.setsampwidth(2)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(pcm.tobytes())
    print(f"Wrote {OUTPUT} ({OUTPUT.stat().st_size / 1024 / 1024:.2f} MiB, {DURATION:.1f}s)")


if __name__ == "__main__":
    main()
