import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  mimeType = 'audio/webm';
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  state: RecordingState = 'inactive';
  start = vi.fn(() => { this.state = 'recording'; });
  stop = vi.fn(() => {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['voice'], { type: 'audio/webm' }) } as BlobEvent);
    this.onstop?.();
  });

  constructor() { MockMediaRecorder.instances.push(this); }
}

async function openAnimalLesson(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Animals/ }));
  await user.click(screen.getByRole('button', { name: /Start Level 1/ }));
}

async function advanceToSpeak(user: ReturnType<typeof userEvent.setup>) {
  await openAnimalLesson(user);
  expect(screen.getAllByRole('button', { name: /^Say / })).toHaveLength(4);
  await user.click(screen.getByRole('button', { name: /Ready for a listening game/ }));

  const heading = screen.getByRole('heading', { name: /Can you find/ }).textContent ?? '';
  const promptWord = heading.match(/“(.+)”/)?.[1];
  expect(promptWord).toBeTruthy();
  await user.click(screen.getByRole('button', { name: `Choose ${promptWord}` }));
  await user.click(screen.getByRole('button', { name: /Next: speaking/ }));
  return screen.getByRole('button', { name: /Press and hold to speak/ });
}

describe('App flow', () => {
  const stopTrack = vi.fn();
  const createObjectURL = vi.fn(() => 'blob:recording');

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    stopTrack.mockClear();
    createObjectURL.mockClear();
    MockMediaRecorder.instances = [];
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { cancel: vi.fn(), speak: vi.fn() }
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: class {
        text: string;
        lang = '';
        rate = 1;
        pitch = 1;
        constructor(text: string) { this.text = text; }
      }
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] })
      }
    });
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: MockMediaRecorder });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  it('starts on the three illustrated theme choices', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: /Animals/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fruits/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Food/ })).toBeInTheDocument();
    expect(document.querySelectorAll('.theme-tile__art img')).toHaveLength(3);
  });

  it('opens a theme and explores all illustrated words', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Animals/ }));
    await user.click(screen.getByRole('button', { name: /Explore/ }));

    expect(screen.getByRole('heading', { name: /Animals words/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Say / })).toHaveLength(50);
    expect(document.querySelectorAll('.word-card__art img')).toHaveLength(50);
  });

  it('does not allow a child to finish before speaking', async () => {
    const user = userEvent.setup();
    render(<App />);

    await advanceToSpeak(user);

    expect(screen.getByRole('button', { name: /Finish lesson/ })).toBeDisabled();
    expect(screen.queryByRole('heading', { name: /Sticker earned/ })).not.toBeInTheDocument();
  });

  it('records, offers playback, completes the level, and stores progress', async () => {
    const user = userEvent.setup();
    render(<App />);
    const holdButton = await advanceToSpeak(user);

    fireEvent.keyDown(holdButton, { key: ' ', code: 'Space' });
    expect(holdButton).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(MockMediaRecorder.instances[0].start).toHaveBeenCalled());
    fireEvent.keyUp(holdButton, { key: ' ', code: 'Space' });

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Great speaking/));
    expect(stopTrack).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalled();
    expect(screen.getByLabelText(/Hear your voice/)).toHaveAttribute('src', 'blob:recording');
    expect(screen.getByRole('button', { name: /Finish lesson/ })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /Finish lesson/ }));
    expect(screen.getByRole('heading', { name: /Sticker earned/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Back to theme/ }));
    expect(localStorage.getItem('little-english-progress-v1')).toContain('animals-sticker-1');
  });

  it('ignores repeated keyboard presses while recording', async () => {
    const user = userEvent.setup();
    render(<App />);
    const holdButton = await advanceToSpeak(user);

    fireEvent.keyDown(holdButton, { key: 'Enter', code: 'Enter' });
    fireEvent.keyDown(holdButton, { key: 'Enter', code: 'Enter', repeat: true });
    await waitFor(() => expect(MockMediaRecorder.instances).toHaveLength(1));
    fireEvent.keyUp(holdButton, { key: 'Enter', code: 'Enter' });
    await waitFor(() => expect(holdButton).toHaveAttribute('aria-pressed', 'false'));
  });

  it('offers an explicit skip when microphone permission is blocked', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('blocked')) }
    });
    const user = userEvent.setup();
    render(<App />);
    const holdButton = await advanceToSpeak(user);

    fireEvent.keyDown(holdButton, { key: ' ', code: 'Space' });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/blocked/));
    expect(screen.getByRole('button', { name: /Finish lesson/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /Skip speaking this time/ }));
    expect(screen.getByRole('button', { name: /Finish lesson/ })).toBeEnabled();
  });
});
