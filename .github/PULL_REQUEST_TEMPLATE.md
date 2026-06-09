## Summary

A concise description of what this PR does and why.

Closes # (issue number, if applicable)

## Type of change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Refactor / code cleanup
- [ ] Documentation update

## Changes made

- ...
- ...

## How to test

Describe how to verify this change works as expected.

```bash
# example commands
./bin/mailtub new
./bin/mailtub send word1234@localhost --subject "Test"
```

## Checklist

- [ ] `go build -buildvcs=false -o bin/mailtub ./cmd/mailtub` succeeds
- [ ] `go test ./...` passes
- [ ] Frontend builds: `cd web && pnpm run build`
- [ ] Existing behavior is not broken
- [ ] New env vars / config options are documented in `docs/configuration.md`
- [ ] CHANGELOG.md updated (if noteworthy)
