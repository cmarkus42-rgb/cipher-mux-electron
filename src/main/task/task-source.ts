import type { CreateTaskOpts } from '../../shared/types'

export type TaskEmitter = (opts: CreateTaskOpts) => void

export interface TaskSource {
  readonly name: string
  start(emit: TaskEmitter): void
  stop(): void
}
