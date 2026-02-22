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

Quick fixes:

- `noTodoComments` supports a direct quick fix that removes the marker token.
- any linter diagnostic supports:
  - `Disable <rule> for next line` (`// oplint-disable-next-line <rule-id>`)
  - `Disable <rule> for block` (`// oplint-disable-start <rule-id>` + `// oplint-disable-end <rule-id>`)
  - `Disable <rule> for file` (`// oplint-disable <rule-id>`)
  - `Re-enable <rule> below` (`// oplint-enable <rule-id>`)

Suppression directives:

- `// oplint-disable <rule-id>` (file-wide)
- `// oplint-enable <rule-id>` (re-enable file-wide suppression)
- `// oplint-disable-next-line <rule-id>` (single next line)
- `// oplint-disable-start <rule-id>` / `// oplint-disable-end <rule-id>` (manual block suppression)
- `*` is supported as a wildcard rule id.

Rule profile presets:

- `openplanetAngelscriptLinter.profile = recommended` (default)
- `openplanetAngelscriptLinter.profile = strict`
- `openplanetAngelscriptLinter.profile = custom` (uses per-rule `enable`/`severity` settings)

Settings prefix:

- `openplanetAngelscriptLinter.*`

Development:

- `npm run compile`
- `npm test`
