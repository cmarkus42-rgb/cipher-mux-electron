import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface DependencyStatus {
  id: string;
  name: string;
  installed: boolean;
  required: boolean;
  size: string;
  description: string;
}

function whichExists(cmd: string): boolean {
  try {
    execFileSync('which', [cmd], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function systemNodeExists(): boolean {
  const candidates = ['/opt/homebrew/bin/node', '/usr/local/bin/node'];
  for (const p of candidates) {
    if (fs.existsSync(p)) return true;
  }
  return whichExists('node');
}

function whisperModelExists(): boolean {
  return fs.existsSync(
    path.join(os.homedir(), '.config/cipher-mux/models/whisper/ggml-small.bin')
  );
}

function piperModelExists(): boolean {
  // Check both possible model locations
  const configDir = path.join(
    os.homedir(), '.config/cipher-mux/models/piper/vits-piper-de_DE-cipher_adult-medium'
  );
  const appSupportDir = path.join(
    os.homedir(),
    'Library/Application Support/cipher-mux-electron/models/piper/vits-piper-de_DE-cipher_adult-medium'
  );
  for (const dir of [configDir, appSupportDir]) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      if (files.some((f) => f.endsWith('.onnx'))) return true;
    } catch { /* ignore */ }
  }
  return false;
}

export async function checkAll(): Promise<DependencyStatus[]> {
  return [
    {
      id: 'homebrew',
      name: 'Homebrew',
      installed: whichExists('brew'),
      required: true,
      size: '~200MB',
      description: 'macOS Package Manager — wird für tmux und node benötigt',
    },
    {
      id: 'tmux',
      name: 'tmux',
      installed: whichExists('tmux'),
      required: true,
      size: '~2MB',
      description: 'Terminal Multiplexer — Session-Backend für cipher-mux',
    },
    {
      id: 'node',
      name: 'Node.js',
      installed: systemNodeExists(),
      required: false,
      size: '~30MB',
      description: 'JavaScript Runtime — empfohlen für Claude Code CLI',
    },
    {
      id: 'claude-code',
      name: 'Claude Code CLI',
      installed: whichExists('claude'),
      required: false,
      size: '~50MB',
      description: 'AI Coding Assistant CLI — benötigt Node.js',
    },
    {
      id: 'whisper-model',
      name: 'Whisper Model (small)',
      installed: whisperModelExists(),
      required: false,
      size: '~500MB',
      description: 'Speech-to-Text Modell für Voice-Pipeline',
    },
    {
      id: 'piper-model',
      name: 'Piper TTS Model (Cipher Adult)',
      installed: piperModelExists(),
      required: false,
      size: '~79MB (bundled)',
      description: 'Cipher Adult Stimme — im App-Bundle enthalten',
    },
  ];
}
