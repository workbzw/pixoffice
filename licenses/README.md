# Third-party software licenses

`public/THIRD_PARTY_NOTICES.txt` retains the full license texts and copyright
notices for the locked production dependency tree. Vite copies this file and
`public/LICENSE.txt` into the deployed site without changing the interface.

- `npm run licenses:generate` regenerates both files; `npm run build` runs it automatically.
- `npm run licenses:check` checks for missing, changed or unreviewed licenses and stale notices.
- Commit the generated notices alongside dependency changes. Do not deploy without these files.
- New license identifiers require review before being added to the approved list in the generator.
- Development-only tools are not included in the static web distribution. Re-audit if distributing those tools, an SDK or a desktop application.

The `@pixi/colord@2.9.6` npm package omits its license file. Its exact upstream
MIT text is retained in `pixi-colord-2.9.6.txt`, verified against
https://github.com/pixijs/colord/blob/v2.9.6/LICENSE.md.
The supplement is version-specific: upgrades must be checked again.
The generator also reads the complete license sections in the legacy
`pathfinding@0.4.18` and `heap@0.2.5` READMEs, and retains the entire Lucide
license file including the Feather attribution.

These notices address software dependency licensing only. They do not establish
rights to artwork, replace third-party licenses or guarantee legal clearance.
