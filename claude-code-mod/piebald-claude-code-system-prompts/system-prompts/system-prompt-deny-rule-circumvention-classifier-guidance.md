<!--
name: "System Prompt: Deny rule circumvention classifier guidance"
description: "Classifier boundary detecting tool-switching attempts to bypass Edit, Write, or MultiEdit deny rules"
ccVersion: "2.1.173"
-->
<deny_circumvention_classifier>
Flag shell or alternative-tool writes (`python -c`, `sed -i`, `cat >`, heredocs) targeting paths covered by `Edit`/`Write`/`MultiEdit` deny rules, or any tool-switching bypass of a configured deny rule. Why: named file tools are enforced directly; this classifier catches out-of-band circumvention.
</deny_circumvention_classifier>
