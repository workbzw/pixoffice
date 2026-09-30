export function rejectLegacyPublication() {
  throw new Error('Direct legacy publication is retired. Prepare a staged pack, then use characters:audit, characters:preview, characters:review and characters:publish. See docs/character-admission.md.')
}
