// NOTE: exec() is used intentionally — hook commands are admin-configured shell pipelines, not user input.
import { exec } from 'child_process'
import { TASK_HOOK_TIMEOUT_MS } from '../../shared/constants'
import type { Task } from '../../shared/types'

export interface HookResult {
  success: boolean
  exitCode: number
  stdout: string
  stderr: string
  timedOut: boolean
}

export interface DefaultHooks {
  beforeRun?: string
  afterRun?: string
  timeout?: number
}

export class TaskHooks {
  constructor(private defaultHooks?: DefaultHooks) {}

  async runBeforeRun(task: Task, projectPath: string): Promise<HookResult> {
    const cmd = task.policy?.hooks?.beforeRun ?? this.defaultHooks?.beforeRun
    const timeout = task.policy?.hooks?.timeout ?? this.defaultHooks?.timeout ?? TASK_HOOK_TIMEOUT_MS
    return this.runHook(cmd, projectPath, timeout)
  }

  async runAfterRun(task: Task, projectPath: string): Promise<HookResult> {
    const cmd = task.policy?.hooks?.afterRun ?? this.defaultHooks?.afterRun
    const timeout = task.policy?.hooks?.timeout ?? this.defaultHooks?.timeout ?? TASK_HOOK_TIMEOUT_MS
    return this.runHook(cmd, projectPath, timeout)
  }

  private runHook(cmd: string | undefined, cwd: string, timeout: number): Promise<HookResult> {
    if (!cmd) {
      return Promise.resolve({
        success: true, exitCode: 0, stdout: '', stderr: '', timedOut: false,
      })
    }

    return new Promise((resolve) => {
      const child = exec(cmd, { cwd, timeout }, (error, stdout, stderr) => {
        const timedOut = error?.killed === true
        const exitCode = timedOut ? -1 : (error?.code ?? 0)
        resolve({
          success: !error,
          exitCode: typeof exitCode === 'number' ? exitCode : 1,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          timedOut,
        })
      })
      child.unref?.()
    })
  }
}
