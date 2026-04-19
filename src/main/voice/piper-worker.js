/**
 * piper-worker.js — Child process for Piper TTS via sherpa-onnx-node.
 *
 * Runs under system Node.js (not Electron) because sherpa-onnx-node
 * requires a real Node.js runtime with native addon support.
 *
 * Protocol (IPC via process.send / process.on('message')):
 *
 * IN:
 *   { cmd: 'init',     modelDir: string, numThreads: number }
 *   { cmd: 'generate', text: string, sid: number, speed: number, id: string }
 *   { cmd: 'shutdown' }
 *
 * OUT:
 *   { type: 'ready' }
 *   { type: 'audio', id: string, sampleRate: number, samples: string (base64 Float32LE) }
 *   { type: 'error', id?: string, message: string }
 *   { type: 'log',   level: string, message: string }
 */

'use strict'

const fs = require('node:fs')
const path = require('node:path')

let tts = null

function log(level, message) {
  if (process.send) {
    process.send({ type: 'log', level, message })
  }
}

function sendError(message, id) {
  if (process.send) {
    process.send({ type: 'error', id, message })
  }
}

/**
 * Find the .onnx model file in modelDir.
 * Piper models are named like model.onnx or *.onnx
 */
function findModelFile(modelDir) {
  const files = fs.readdirSync(modelDir)
  const onnxFile = files.find(f => f.endsWith('.onnx'))
  if (!onnxFile) {
    throw new Error(`No .onnx model file found in ${modelDir}`)
  }
  return path.join(modelDir, onnxFile)
}

/**
 * Find tokens.txt in modelDir
 */
function findTokensFile(modelDir) {
  const tokensPath = path.join(modelDir, 'tokens.txt')
  if (!fs.existsSync(tokensPath)) {
    throw new Error(`tokens.txt not found in ${modelDir}`)
  }
  return tokensPath
}

/**
 * Find optional data dir file (espeak-ng-data)
 */
function findDataDir(modelDir) {
  const dataDir = path.join(modelDir, 'espeak-ng-data')
  if (fs.existsSync(dataDir)) return dataDir
  return ''
}

async function handleInit(msg) {
  const { modelDir, numThreads } = msg

  if (!modelDir || !fs.existsSync(modelDir)) {
    sendError(`Model directory does not exist: ${modelDir}`)
    return
  }

  try {
    const modelPath = findModelFile(modelDir)
    const tokensPath = findTokensFile(modelDir)
    const dataDir = findDataDir(modelDir)

    log('info', `Loading model: ${modelPath}`)
    log('info', `Tokens: ${tokensPath}`)
    if (dataDir) log('info', `Data dir: ${dataDir}`)

    // Import sherpa-onnx-node
    let sherpa
    try {
      sherpa = require('sherpa-onnx-node')
    } catch (err) {
      sendError(`Failed to load sherpa-onnx-node: ${err.message}`)
      return
    }

    // Create offline TTS config (sherpa-onnx-node v1.12+ API)
    const config = {
      model: {
        vits: {
          model: modelPath,
          tokens: tokensPath,
          dataDir: dataDir,
        },
        numThreads: numThreads || 2,
        debug: false,
        provider: 'cpu',
      },
    }

    tts = new sherpa.OfflineTts(config)
    log('info', `TTS engine ready (sampleRate: ${tts.sampleRate})`)

    if (process.send) {
      process.send({ type: 'ready' })
    }
  } catch (err) {
    sendError(`Init failed: ${err.message}`)
  }
}

function handleGenerate(msg) {
  const { text, sid, speed, id } = msg

  if (!tts) {
    sendError('TTS not initialized', id)
    return
  }

  try {
    const result = tts.generate({ text, sid: sid || 0, speed: speed || 1.0 })

    if (!result || !result.samples || result.samples.length === 0) {
      sendError('TTS generated empty audio', id)
      return
    }

    // Convert Float32Array to base64 for IPC transfer
    const float32Buf = Buffer.from(result.samples.buffer,
      result.samples.byteOffset,
      result.samples.byteLength)
    const base64 = float32Buf.toString('base64')

    if (process.send) {
      process.send({
        type: 'audio',
        id,
        sampleRate: result.sampleRate || tts.sampleRate,
        samples: base64,
      })
    }
  } catch (err) {
    sendError(`Generate failed: ${err.message}`, id)
  }
}

function handleShutdown() {
  log('info', 'Shutting down...')
  tts = null
  setTimeout(() => process.exit(0), 100)
}

// Message handler
process.on('message', (msg) => {
  if (!msg || !msg.cmd) return

  switch (msg.cmd) {
    case 'init':
      handleInit(msg)
      break
    case 'generate':
      handleGenerate(msg)
      break
    case 'shutdown':
      handleShutdown()
      break
    default:
      log('warn', `Unknown command: ${msg.cmd}`)
  }
})

// Graceful cleanup on disconnect
process.on('disconnect', () => {
  log('info', 'Parent disconnected, exiting')
  tts = null
  process.exit(0)
})

// Handle SIGTERM
process.on('SIGTERM', () => {
  log('info', 'SIGTERM received, exiting')
  tts = null
  process.exit(0)
})

// Unhandled errors
process.on('uncaughtException', (err) => {
  sendError(`Uncaught exception: ${err.message}`)
  process.exit(1)
})

log('info', 'Piper worker started, waiting for init...')
