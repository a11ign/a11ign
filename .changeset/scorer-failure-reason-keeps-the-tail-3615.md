---
"@a11ign/judge": patch
---

A scorer failure's reason is the END of the subprocess's stderr, not its first 400 characters. The head holds the harmless `transformers` "None of PyTorch..." import warning, so the log pointed at installing PyTorch and cut the traceback off mid-line; the tail holds the exception (#3615).
