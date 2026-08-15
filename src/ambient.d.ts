// Ambient declarations for host-side modules that exist only at runtime in the
// DSH profile (not resolvable during a standalone build/typecheck).
declare module '@deepseek-ai/cordis-plugin-include' {
  export class Include {
    constructor(ctx: unknown, ...config: unknown[])
    await(): Promise<unknown>
    dispose(): Promise<void>
    write?(): void
  }
}
