import { execFile, execFileSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function getBrewPath(): string {
  if (fs.existsSync('/opt/homebrew/bin/brew')) return '/opt/homebrew/bin/brew';
  if (fs.existsSync('/usr/local/bin/brew')) return '/usr/local/bin/brew';
  throw new Error('Homebrew not found');
}

function spawnWithProgress(
  cmd: string,
  args: string[],
  onProgress: (msg: string) => void
): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    proc.stdout.on('data', (data: Buffer) => {
      onProgress(data.toString().trim());
    });

    proc.stderr.on('data', (data: Buffer) => {
      onProgress(data.toString().trim());
    });

    proc.on('close', (code) => {
      resolve(code === 0);
    });

    proc.on('error', (err) => {
      onProgress(`Error: ${err.message}`);
      resolve(false);
    });
  });
}

async function ensureXcodeCLT(onProgress: (msg: string) => void): Promise<boolean> {
  // Check if Xcode CLT is already installed
  try {
    execFileSync('xcode-select', ['-p'], { stdio: 'pipe' });
    onProgress('Xcode Command Line Tools already installed');
    return true;
  } catch {
    // Not installed — trigger install
  }

  onProgress('Installing Xcode Command Line Tools...');

  return new Promise((resolve) => {
    execFile('xcode-select', ['--install'], (error) => {
      if (error) {
        // error code 1 means install dialog was shown, which is expected
        // A real failure would be if the command itself is not found
        if ((error as any).code === 'ENOENT') {
          onProgress('xcode-select not found');
          resolve(false);
          return;
        }
      }

      // Poll for CLT installation (max 5 minutes)
      const maxWait = 5 * 60 * 1000;
      const interval = 5000;
      let elapsed = 0;

      const poll = setInterval(() => {
        elapsed += interval;
        try {
          execFileSync('xcode-select', ['-p'], { stdio: 'pipe' });
          clearInterval(poll);
          onProgress('Xcode Command Line Tools installed successfully');
          resolve(true);
        } catch {
          if (elapsed >= maxWait) {
            clearInterval(poll);
            onProgress('Xcode CLT install timed out (5min). Please install manually and retry.');
            resolve(false);
          } else {
            onProgress(`Waiting for Xcode CLT install... (${Math.round(elapsed / 1000)}s)`);
          }
        }
      }, interval);
    });
  });
}

async function installHomebrew(onProgress: (msg: string) => void): Promise<boolean> {
  // Xcode CLT is a prerequisite for Homebrew
  const cltOk = await ensureXcodeCLT(onProgress);
  if (!cltOk) {
    onProgress('Cannot install Homebrew without Xcode Command Line Tools');
    return false;
  }

  onProgress('Installing Homebrew (requires admin password)...');

  return new Promise((resolve) => {
    const script =
      'do shell script "NONINTERACTIVE=1 /bin/bash -c \\"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\\"" with administrator privileges';

    execFile('osascript', ['-e', script], (error) => {
      if (error) {
        onProgress(`Homebrew install failed: ${error.message}`);
        resolve(false);
        return;
      }

      const installed =
        fs.existsSync('/opt/homebrew/bin/brew') ||
        fs.existsSync('/usr/local/bin/brew');

      if (installed) {
        onProgress('Homebrew installed successfully');
        resolve(true);
      } else {
        onProgress('Homebrew binary not found after install');
        resolve(false);
      }
    });
  });
}

async function installTmux(onProgress: (msg: string) => void): Promise<boolean> {
  onProgress('Installing tmux via Homebrew...');
  const brewPath = getBrewPath();
  return spawnWithProgress(brewPath, ['install', 'tmux'], onProgress);
}

async function installNode(onProgress: (msg: string) => void): Promise<boolean> {
  onProgress('Installing Node.js via Homebrew...');
  const brewPath = getBrewPath();
  return spawnWithProgress(brewPath, ['install', 'node'], onProgress);
}

async function installClaudeCode(onProgress: (msg: string) => void): Promise<boolean> {
  onProgress('Installing Claude Code CLI via npm...');
  // Prefer Homebrew node's npm
  const npmPaths = ['/opt/homebrew/bin/npm', '/usr/local/bin/npm'];
  let npmPath = 'npm';
  for (const p of npmPaths) {
    if (fs.existsSync(p)) { npmPath = p; break; }
  }
  return spawnWithProgress(npmPath, ['install', '-g', '@anthropic-ai/claude-code'], onProgress);
}

async function installWhisperModel(onProgress: (msg: string) => void): Promise<boolean> {
  const destDir = path.join(os.homedir(), '.config/cipher-mux/models/whisper');
  const destPath = path.join(destDir, 'ggml-small.bin');

  onProgress('Creating model directory...');
  fs.mkdirSync(destDir, { recursive: true });

  onProgress('Downloading Whisper model (~500MB)...');
  const url =
    'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin';

  return spawnWithProgress('curl', ['-L', '--progress-bar', '-o', destPath, url], onProgress);
}

async function installPiperModel(onProgress: (msg: string) => void): Promise<boolean> {
  const destDir = path.join(
    os.homedir(),
    'Library/Application Support/cipher-mux-electron/models/piper/vits-piper-de_DE-dii-high'
  );

  onProgress('Creating model directory...');
  fs.mkdirSync(destDir, { recursive: true });

  const baseUrl =
    'https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/dii/high';

  onProgress('Downloading Piper ONNX model...');
  const onnxOk = await spawnWithProgress(
    'curl',
    ['-L', '--progress-bar', '-o', path.join(destDir, 'de_DE-dii-high.onnx'), `${baseUrl}/de_DE-dii-high.onnx`],
    onProgress
  );

  if (!onnxOk) {
    onProgress('ONNX model download failed');
    return false;
  }

  onProgress('Downloading Piper ONNX config...');
  const jsonOk = await spawnWithProgress(
    'curl',
    ['-L', '--progress-bar', '-o', path.join(destDir, 'de_DE-dii-high.onnx.json'), `${baseUrl}/de_DE-dii-high.onnx.json`],
    onProgress
  );

  if (!jsonOk) {
    onProgress('ONNX config download failed');
    return false;
  }

  onProgress('Piper model installed successfully');
  return true;
}

export async function installDependency(
  id: string,
  onProgress: (msg: string) => void
): Promise<boolean> {
  switch (id) {
    case 'homebrew':
      return installHomebrew(onProgress);
    case 'tmux':
      return installTmux(onProgress);
    case 'node':
      return installNode(onProgress);
    case 'claude-code':
      return installClaudeCode(onProgress);
    case 'whisper-model':
      return installWhisperModel(onProgress);
    case 'piper-model':
      return installPiperModel(onProgress);
    default:
      onProgress(`Unknown dependency: ${id}`);
      return false;
  }
}
