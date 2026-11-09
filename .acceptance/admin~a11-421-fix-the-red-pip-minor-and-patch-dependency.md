Closes A11-421

`dependency-pr-body.yml`'s `group_title_pattern` accepted only the plural "across N directories", so Dependabot's title for a group over one directory ("deps: bump the pip-minor-and-patch group across 1 directory with 4 updates", a11ign#5736) was "not auto-declared": no `Acceptance:` fragment was written, `acceptance / run` failed on Dependabot's release notes, and `gate` failed. The pattern now also accepts the singular "across N directory". Nothing else in the writer changes: majors, files outside the requirements files, owned paths and the no-checkout rules are as before.

What the command proves: the one-directory title with the four scorer updates gets the fixed fragment naming huggingface-hub, onnxruntime, torch and transformers; the existing two-directory title and the `in /dir` and bare titles are still declared (existing cases); a one-directory group holding a major writes nothing and logs that the group holds a major. The two new cases fail on the base workflow and pass here.

Acceptance:
pnpm exec rstest run --config=scripts/rstest/rstest.config.ts --include packages/guards/src/dependency-pr-body.test.ts --include packages/guards/src/dependency-pr-body-title.test.ts
