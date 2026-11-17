<!--
name: "Skill: Run CLI tool example"
description: "Example for the Run app skill: document building, invoking, and testing a CLI tool"
ccVersion: "2.1.246"
-->
# Example: CLI tool

CLIs have no background process, ports, or lifecycle. Focus the skill on **installation**, **representative invocations**, and **testing**.

## Checklist

- **PATH setup**: State explicitly how to make the binary available (global install, `npx`/`uv run`, or `./target/release/foo`).
- **2–3 example invocations**: Cover primary use cases with expected output.
- **Exit codes**: Document meaningful non-zero codes (e.g., linter returns `1` on findings).
- **Stdin**: Document stdin/stdout behavior if supported.

## Example snippet

> ---
> name: run-mytool
> description: Build, install, and run mytool. Use when asked to run mytool, test it, or verify it's installed correctly.
> ---
>
> ## Setup
>
> ```bash
> pip install -e .
> ```
>
> This puts `mytool` on PATH. Verify:
>
> ```bash
> mytool --version
> # -> mytool 0.3.1
> ```
>
> ## Run
>
> Process a single file:
>
> ```bash
> mytool process input.json
> # -> Processed 42 records, wrote output.json
> ```
>
> Read from stdin, write to stdout:
>
> ```bash
> cat input.json | mytool process -
> ```
>
> Lint a directory (exits non-zero on problems):
>
> ```bash
> mytool lint ./src
> echo $?  # 0 if clean, 1 if issues found
> ```
>
> ## Test
>
> ```bash
> pytest
> ```

## Keep it short

Do not pad with every flag—`--help` covers that. Show only enough to (a) build, (b) verify it works, and (c) run tests.
