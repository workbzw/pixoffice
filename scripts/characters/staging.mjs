export function assertStagingArguments(args, allowed = []) {
  for (const argument of args) if (!allowed.includes(argument)) {
    throw new Error(`Unknown option ${argument}. This script only prepares candidates; publish approved packs with characters:publish. See docs/character-admission.md.`)
  }
}
