# Voice Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add realtime voice dictation to the session composer without changing message sending behavior.

**Architecture:** Keep speech recognition in the renderer using the browser Web Speech API. A focused `useSpeechRecognition` hook owns feature detection, recognition lifecycle, transcript events, and error state. `ComposerBar` renders the microphone control and appends finalized speech text into the existing textarea content.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Chromium Web Speech API, lucide-react.

---

### Task 1: Speech Recognition Hook

**Files:**
- Create: `src/renderer/src/hooks/useSpeechRecognition.ts`
- Test: `test/phase-23/speech-recognition.test.tsx`

- [ ] Write failing tests for unsupported browsers, start/stop lifecycle, interim transcript, final transcript, and recognition errors.
- [ ] Run `pnpm vitest run test/phase-23/speech-recognition.test.tsx` and verify the tests fail because the hook does not exist.
- [ ] Implement `useSpeechRecognition` with `isSupported`, `isListening`, `interimTranscript`, `error`, `startListening`, `stopListening`, and `resetInterimTranscript`.
- [ ] Run `pnpm vitest run test/phase-23/speech-recognition.test.tsx` and verify it passes.

### Task 2: Composer Integration

**Files:**
- Modify: `src/renderer/src/components/session-hq/ComposerBar.tsx`
- Test: `test/phase-23/composer-bar.test.tsx`

- [ ] Write failing tests that the composer renders a disabled microphone button when unsupported and appends final voice transcript to the textarea when supported.
- [ ] Run `pnpm vitest run test/phase-23/composer-bar.test.tsx` and verify the tests fail before integration.
- [ ] Add the microphone button next to the attachment button, use `Mic` and `MicOff` icons, and wire it to `useSpeechRecognition`.
- [ ] Show interim transcript as a lightweight hint below the textarea while listening.
- [ ] Run `pnpm vitest run test/phase-23/composer-bar.test.tsx` and verify it passes.

### Task 3: Verification

**Files:**
- Verify: `src/renderer/src/hooks/useSpeechRecognition.ts`
- Verify: `src/renderer/src/components/session-hq/ComposerBar.tsx`

- [ ] Run focused tests: `pnpm vitest run test/phase-23/speech-recognition.test.tsx test/phase-23/composer-bar.test.tsx`.
- [ ] Run type checking: `pnpm exec tsc --noEmit --pretty false`.
- [ ] Review `git diff` to confirm the change is limited to voice input behavior and plan documentation.
