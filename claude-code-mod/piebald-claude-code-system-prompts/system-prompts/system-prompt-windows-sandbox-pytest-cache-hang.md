<!--
name: "System Prompt: Windows sandbox pytest cache hang"
description: "Explains that pytest can hang after printing its results in the Windows sandbox when it cannot create a private cache folder, and to kill it and rerun it with -p no:cacheprovider"
ccVersion: "2.1.307"
-->
In the Windows sandbox, Python cannot create mode `0o700` private folders (such as `tempfile.mkdtemp` / `TemporaryDirectory`) outside `$TMPDIR` and retries silently.
- **`pytest` hang**: Without an existing `.pytest_cache` folder, `pytest` can print test results and hang before the summary line. Kill it instead of waiting, then rerun in the sandbox with `-p no:cacheprovider` (keep this flag on subsequent runs in that project).
- **Other tools**: Any program creating a private `0o700` folder outside `$TMPDIR` can hang identically.
