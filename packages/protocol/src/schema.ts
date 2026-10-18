import { z } from 'zod'
// Shared wire-level validation; no runtime or rendering dependencies.

export type JsonValue = string | number | boolean | JsonValue[] | { [key: string]: JsonValue }
export const maxProtocolDepth = 64
export class ProtocolValueFault extends Error {
  readonly path: string
  constructor(path: string, message: string) { super(`${message}: ${path}`); this.path = path }
}

/** Inspect raw values before a parser can strip keys or JSON can replace values with null. */
export function assertProtocolValue(value: unknown): asserts value is JsonValue {
  type Entry = { value: unknown; path: string; depth: number; exit?: boolean }
  const pending: Entry[] = [{ value, path: '$', depth: 0 }], ancestors = new WeakSet<object>()
  while (pending.length) {
    const entry = pending.pop()!, current = entry.value
    if (entry.exit) { ancestors.delete(current as object); continue }
    if (current === null) throw new ProtocolValueFault(entry.path, 'Null is not allowed')
    if (typeof current === 'string' || typeof current === 'boolean') continue
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) throw new ProtocolValueFault(entry.path, 'Non-finite numbers are not allowed')
      continue
    }
    if (typeof current !== 'object') throw new ProtocolValueFault(entry.path, 'Expected a JSON value')
    if (entry.depth > maxProtocolDepth) throw new ProtocolValueFault(entry.path, 'Protocol nesting is too deep')
    if (ancestors.has(current)) throw new ProtocolValueFault(entry.path, 'Cyclic values are not allowed')
    const array = Array.isArray(current), prototype = Object.getPrototypeOf(current)
    if (!array && prototype !== Object.prototype && prototype !== null) throw new ProtocolValueFault(entry.path, 'Expected a plain JSON object')
    ancestors.add(current); pending.push({ ...entry, exit: true })
    if (array) {
      for (let index = current.length - 1; index >= 0; index--) {
        const path = `${entry.path}[${index}]`, descriptor = Object.getOwnPropertyDescriptor(current, index)
        if (!descriptor) throw new ProtocolValueFault(path, 'Sparse arrays are not allowed')
        if (!('value' in descriptor)) throw new ProtocolValueFault(path, 'Accessors are not allowed')
        pending.push({ value: descriptor.value, path, depth: entry.depth + 1 })
      }
    } else {
      for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(current))) {
        if (!descriptor.enumerable) continue
        const path = `${entry.path}[${JSON.stringify(key)}]`
        if (key === '__proto__') throw new ProtocolValueFault(path, 'Reserved object keys are not allowed')
        if (!('value' in descriptor)) throw new ProtocolValueFault(path, 'Accessors are not allowed')
        pending.push({ value: descriptor.value, path, depth: entry.depth + 1 })
      }
    }
    if (typeof (current as { toJSON?: unknown }).toJSON === 'function') throw new ProtocolValueFault(entry.path, 'Custom JSON conversion is not allowed')
  }
}

export function assertProtocolObject(value: unknown): asserts value is Record<string, JsonValue> {
  assertProtocolValue(value)
  if (typeof value !== 'object' || Array.isArray(value)) throw new ProtocolValueFault('$', 'Expected a JSON object')
}
export function stringifyProtocolObject(value: unknown): string {
  assertProtocolObject(value)
  return stringifyDocumentObject(value)
}
/** Local documents may omit optional undefined fields; their encoded data must still be null-free. */
export function stringifyDocumentObject(value: unknown, space?: number): string {
  const source = JSON.stringify(value, undefined, space)
  if (source === undefined) throw new ProtocolValueFault('$', 'Expected a JSON object')
  // Proxies can change values between inspection and encoding; validate the actual bytes too.
  parseProtocolObject(source)
  return source
}
export function parseProtocolObject(source: string): Record<string, JsonValue> {
  const value: unknown = JSON.parse(source); assertProtocolObject(value); return value
}

const rawJsonSchema = z.unknown().superRefine((value, context) => {
  try { assertProtocolValue(value) }
  catch (error) { context.addIssue({ code: 'custom', message: error instanceof Error ? error.message : 'Invalid protocol value' }) }
})
const jsonStructureSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(), z.number(), z.boolean(), z.array(jsonStructureSchema), z.record(z.string(), jsonStructureSchema),
]))
export const jsonValueSchema = rawJsonSchema.pipe(jsonStructureSchema)
export const jsonObjectSchema = rawJsonSchema.pipe(z.record(z.string(), jsonStructureSchema))
export const responseEnvelopeSchema = z.strictObject({ code: z.number().int().min(100).max(599), msg: z.string(), data: jsonObjectSchema })

export const idSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_.:-]+$/)
export const pointSchema = z.strictObject({ x: z.number().int(), y: z.number().int() })
export const boxSchema = z.strictObject({ left: z.number().int(), top: z.number().int(), right: z.number().int(), bottom: z.number().int() })
  .refine(b => b.left < b.right && b.top < b.bottom, '区域宽高必须大于 0')
export const blockedAreaSchema = z.strictObject({ id: idSchema, name: z.string().min(1).max(100), bounds: boxSchema })
