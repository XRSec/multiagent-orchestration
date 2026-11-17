<!--
name: "Skill: Run library SDK example"
description: "Example for the Run app skill: document building, testing, and smoke-checking a library or SDK at its public boundary"
ccVersion: "2.1.246"
-->
# Example: Library / SDK

Libraries have no server or CLI process to run. Keep the skill brief and focus on:
1. **Building** from source
2. **Running the test suite**
3. **A minimal smoke-test** exercising the public API

## Smoke-test examples

Include a minimal snippet or program that imports the library and performs one real operation:

> ## Verify
>
> ```bash
> python -c '
> from mylib import Client
> c = Client()
> print(c.ping())
> '
> # -> pong
> ```

Compiled language example:

> ```bash
> cat > /tmp/smoke.go <<GO
> package main
> import "example.com/mylib"
> func main() { println(mylib.Version()) }
> GO
> go run /tmp/smoke.go
> # -> v1.2.3
> ```

## Example snippet

> ---
> name: run-mylib
> description: Build, install, and test mylib from source. Use when asked to verify mylib works, run its tests, or build a distribution.
> ---
>
> `mylib` is a Python library - "running" it means building from source
> and executing the test suite.
>
> ## Setup
>
> ```bash
> pip install -e '.[dev]'
> ```
>
> ## Verify
>
> ```bash
> python -c 'import mylib; print(mylib.__version__)'
> # -> 2.1.0
> ```
>
> ## Test
>
> ```bash
> pytest
> ```
>
> Subset of tests: `pytest tests/unit/`. With coverage: `pytest --cov=mylib`.
>
> ## Build (distribution)
>
> ```bash
> pip install build
> python -m build
> # -> dist/mylib-2.1.0-py3-none-any.whl
> ```

## Checklist

- **Dev vs installed mode**: Note any behavioral difference between `pip install -e .` and `pip install .`.
- **Optional dependencies**: Document extras (`[dev]`, `[test]`, `[docs]`) and when each is required.
- **Generated code**: Document codegen steps (e.g., protobuf, OpenAPI clients) since READMEs often omit them.
