// Package handler contains the HTTP request handlers for MailTub's REST API.
package handler

import (
	"encoding/json"
	"net/http"
	"runtime"
	"time"
)

var startTime = time.Now()

// AppVersion is set at startup by cmd/mailtub/cmd_serve.go from the ldflags
// version variable. Defaults to "dev" when not built with a release tag.
var AppVersion = "dev"

// Health handles GET /api/v1/health
func Health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"status":  "ok",
		"version": AppVersion,
		"uptime":  time.Since(startTime).String(),
		"go":      runtime.Version(),
		"os":      runtime.GOOS,
		"arch":    runtime.GOARCH,
	})
}
