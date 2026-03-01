# Openplanet AngelScript Linter

Standalone linter extension for `openplanet-angelscript` files.

Current rules:

- `noTodoComments`: flags `TODO`/`FIXME`/`XXX` markers in line comments
- `noDebugCalls`: flags `print(...)`, `trace(...)`, and `warn(...)`
- `noAutoType`: optional rule to discourage `auto` declarations
- `noEmptyCatch`: flags `catch` blocks with empty/comment-only bodies
- `noEmptyControlBody`: flags `if (...) ;`, `for (...) ;`, and `while (...) ;` stray-body patterns
- `noUnusedLocals`: flags local declarations that are never referenced
- `noUnusedParams`: flags function parameters that are never referenced
- `noShadowing`: flags local declarations that shadow outer bindings
- `noUnreachableCode`: flags statements after `return`/`throw`/`break`/`continue`
- `noStringByValueParam`: flags `string` parameters passed by value
- `noImplicitFloatToInt`: flags implicit float-to-int narrowing in integer assignments/returns
- `noDeadStore`: flags writes overwritten before any read
- `noDuplicateIncludes`: flags duplicate `#include "..."` directives
- `noDuplicateImports`: flags duplicate `import ... from "..."` declarations
- `preferConstLocals`: flags initialized locals that are never reassigned
- `noRiskyHandleCast`: flags `cast<...@>(...)` handle casts that should be null-guarded

Quick fixes:

- `noTodoComments` supports a direct quick fix that removes the marker token.
- `noUnusedLocals` supports a quick fix to prefix the local with `_`.
- `noUnusedParams` supports a quick fix to prefix the parameter with `_`.
- `noStringByValueParam` supports a quick fix to rewrite as `const string &in`.
- `noDuplicateIncludes` and `noDuplicateImports` support line-removal quick fixes.
- `preferConstLocals` supports a quick fix to insert `const`.
- `preferConstLocals` supports optional direct `Add const` shortcuts (disabled by default):
  - inline CodeLens:
    `openplanetAngelscriptLinter.preferConstLocals.inlineFixCodeLens.enable`
  - hover link:
    `openplanetAngelscriptLinter.preferConstLocals.hoverFixLink.enable`
- any linter diagnostic supports:
  - `Disable <rule> for next line` (`// oplint-disable-next-line <rule-id>` or `// oplint-disable-next-line`)
  - `Disable <rule> for block` (`// oplint-disable-start <rule-id>` + `// oplint-disable-end <rule-id>`, or omitted rule id for wildcard)
  - `Disable <rule> for file` (`// oplint-disable <rule-id>` or `// oplint-disable`)
  - `Re-enable <rule> below` (`// oplint-enable <rule-id>` or `// oplint-enable`)

Suppression directives:

- `// oplint-disable <rule-id>` / `// oplint-disable` (file-wide)
- `// oplint-enable <rule-id>` / `// oplint-enable` (re-enable file-wide suppression)
- `// oplint-disable-next-line <rule-id>` / `// oplint-disable-next-line` (single next line)
- `// oplint-disable-start <rule-id>` / `// oplint-disable-end <rule-id>` (manual block suppression; omitted rule id means wildcard)
- `*` is supported as an explicit wildcard rule id.

Rule profile presets:

- `openplanetAngelscriptLinter.profile = recommended` (default)
- `openplanetAngelscriptLinter.profile = strict`
- `openplanetAngelscriptLinter.profile = custom` (uses per-rule `enable`/`severity` settings)
- `openplanetAngelscriptLinter.rules.preferConstLocals.enable` applies in all profiles (can be toggled directly in Settings UI)

Settings prefix:

- `openplanetAngelscriptLinter.*`

Development:

- `npm run compile`
- `npm test`
- `npm run test:updateSnapshot` (refreshes medium-corpus snapshot)

Checked-in corpus:

- `test-files/linter-corpus/medium-corpus.as`
- snapshot expectation: `test-files/linter-corpus/medium-corpus.snapshot.json`
