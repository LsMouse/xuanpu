import { z } from 'zod'

export const TERMINAL_SERVER_ERROR_CODES = ['BAD_REQUEST', 'INTERNAL'] as const

export const TerminalStatusSchema = z.enum(['connecting', 'open', 'closed', 'error'])
export type TerminalStatus = z.infer<typeof TerminalStatusSchema>

export const TerminalSnapshotMsgSchema = z.object({
  type: z.literal('terminal/snapshot'),
  seq: z.number().int().nonnegative(),
  worktreeId: z.string(),
  terminalId: z.string(),
  cwd: z.string(),
  shell: z.string(),
  status: TerminalStatusSchema,
  buffer: z.string()
})

export const TerminalOutputMsgSchema = z.object({
  type: z.literal('terminal/output'),
  seq: z.number().int().nonnegative(),
  data: z.string()
})

export const TerminalStatusMsgSchema = z.object({
  type: z.literal('terminal/status'),
  seq: z.number().int().nonnegative(),
  status: TerminalStatusSchema
})

export const TerminalExitMsgSchema = z.object({
  type: z.literal('terminal/exit'),
  seq: z.number().int().nonnegative(),
  exitCode: z.number().int().nullable(),
  signal: z.number().int().nullable().optional()
})

export const TerminalErrorMsgSchema = z.object({
  type: z.literal('terminal/error'),
  seq: z.number().int().nonnegative().optional(),
  code: z.enum(TERMINAL_SERVER_ERROR_CODES),
  message: z.string().optional()
})

export const TerminalServerMsgSchema = z.discriminatedUnion('type', [
  TerminalSnapshotMsgSchema,
  TerminalOutputMsgSchema,
  TerminalStatusMsgSchema,
  TerminalExitMsgSchema,
  TerminalErrorMsgSchema
])
export type TerminalServerMsg = z.infer<typeof TerminalServerMsgSchema>

export const TerminalAttachClientMsgSchema = z.object({
  type: z.literal('terminal/attach'),
  terminalId: z.string().optional(),
  cwd: z.string(),
  shell: z.string().optional()
})

export const TerminalInputClientMsgSchema = z.object({
  type: z.literal('terminal/input'),
  data: z.string()
})

export const TerminalResizeClientMsgSchema = z.object({
  type: z.literal('terminal/resize'),
  cols: z.number().int().positive(),
  rows: z.number().int().positive()
})

export const TerminalKillClientMsgSchema = z.object({
  type: z.literal('terminal/kill')
})

export const TerminalRestartClientMsgSchema = z.object({
  type: z.literal('terminal/restart')
})

export const TerminalResumeClientMsgSchema = z.object({
  type: z.literal('terminal/resume'),
  lastSeq: z.number().int().nonnegative()
})

export const TerminalClientMsgSchema = z.discriminatedUnion('type', [
  TerminalAttachClientMsgSchema,
  TerminalInputClientMsgSchema,
  TerminalResizeClientMsgSchema,
  TerminalKillClientMsgSchema,
  TerminalRestartClientMsgSchema,
  TerminalResumeClientMsgSchema
])
export type TerminalClientMsg = z.infer<typeof TerminalClientMsgSchema>

export class TerminalSeqCounter {
  private cur = 0

  next(): number {
    this.cur += 1
    return this.cur
  }

  current(): number {
    return this.cur
  }
}

export class TerminalMessageRingBuffer {
  private readonly frames: TerminalServerMsg[] = []
  private oldestSeq = 0
  private newestSeq = 0

  push(frame: TerminalServerMsg): void {
    if (frame.seq === undefined) return
    if (this.frames.length === 0) {
      this.oldestSeq = frame.seq
    }
    this.frames.push(frame)
    this.newestSeq = frame.seq
    while (this.frames.length > 500) {
      this.frames.shift()
      this.oldestSeq = this.frames[0]?.seq ?? 0
    }
  }

  replayAfter(lastSeq: number): { ok: true; frames: TerminalServerMsg[] } {
    if (this.frames.length === 0 || lastSeq >= this.newestSeq) {
      return { ok: true, frames: [] }
    }
    if (lastSeq + 1 < this.oldestSeq) {
      return { ok: true, frames: this.frames }
    }
    return { ok: true, frames: this.frames.filter((frame) => frame.seq > lastSeq) }
  }
}
