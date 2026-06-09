package handler

import (
	"encoding/json"
	"net/http"

	"github.com/dml-labs/mailtub/internal/config"
)

// configResponse is the sanitised view of the runtime config — no secrets.
type configResponse struct {
	Version              string `json:"version"`
	HTTPPort             int    `json:"httpPort"`
	SMTPPort             int    `json:"smtpPort"`
	SMTPDomain           string `json:"smtpDomain"`
	SMTPMaxSizeMB        int64  `json:"smtpMaxSizeMB"`
	SMTPStartTLS         bool   `json:"smtpStartTLS"`
	MaxAttachmentSizeMB  int    `json:"maxAttachmentSizeMB"`
	MaxTotalAttachmentMB int    `json:"maxTotalAttachmentMB"`
	MaxBodyKB            int    `json:"maxBodyKB"`
	DatabasePath         string `json:"databasePath"`
	MailboxTTL           string `json:"mailboxTTL"`
	LogLevel             string `json:"logLevel"`
	AdminEnabled         bool   `json:"adminEnabled"`
	APIKeyEnabled        bool   `json:"apiKeyEnabled"`
	RedisEnabled         bool   `json:"redisEnabled"`
}

// Config returns an HTTP handler that serves a sanitised view of the runtime
// configuration. Secrets (ADMIN_PASSWORD, API_KEY, REDIS_URL) are never
// exposed — only whether they are enabled.
func Config(cfg *config.Config) http.HandlerFunc {
	resp := configResponse{
		Version:              AppVersion,
		HTTPPort:             cfg.HTTPPort,
		SMTPPort:             cfg.SMTPPort,
		SMTPDomain:           cfg.SMTPDomain,
		SMTPMaxSizeMB:        cfg.SMTPMaxSize / (1024 * 1024),
		SMTPStartTLS:         cfg.SMTPStartTLS,
		MaxAttachmentSizeMB:  cfg.MaxAttachmentSizeMB,
		MaxTotalAttachmentMB: cfg.MaxTotalAttachmentMB,
		MaxBodyKB:            cfg.MaxBodyKB,
		DatabasePath:         cfg.DatabasePath,
		MailboxTTL:           cfg.MailboxTTL.String(),
		LogLevel:             cfg.LogLevel.String(),
		AdminEnabled:         cfg.AdminPassword != "",
		APIKeyEnabled:        cfg.APIKey != "",
		RedisEnabled:         cfg.RedisURL != "",
	}
	payload, _ := json.Marshal(resp)

	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(payload)
	}
}
