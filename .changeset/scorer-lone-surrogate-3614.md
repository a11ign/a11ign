---
"@a11ign/scorer": patch
---

A page whose screen-reader text contains an unpaired UTF-16 surrogate no longer fails the scorer with `TextEncodeInput must be Union[...]`. The character is replaced with U+FFFD before the text reaches the tokenizer, and a correctly paired one (an emoji) is kept.
