package main

import (
	"fmt"
	"os"
)

// envOr returns the value of an environment variable or a fallback string.
func envOr(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

// die prints an error and exits if err is non-nil.
func die(err error, context string) {
	if err == nil {
		return
	}
	fmt.Fprintf(os.Stderr, "\033[31merror\033[0m %s: %v\n", context, err)
	os.Exit(1)
}

// must calls fs.Parse and is a no-op helper kept for clarity.
func must(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
