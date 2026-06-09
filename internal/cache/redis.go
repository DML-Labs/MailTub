// Package cache provides an optional Redis/Upstash caching layer.
// When REDIS_URL is empty the cache is a no-op, so the binary works
// without Redis on every platform.
package cache

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
)

// Cache wraps an optional Redis client with a simple get/set API.
type Cache struct {
	rdb *redis.Client
}

// New creates a Cache. If url is empty, returns a no-op cache.
func New(url string) *Cache {
	if url == "" {
		return &Cache{}
	}
	opt, err := redis.ParseURL(url)
	if err != nil {
		return &Cache{}
	}
	return &Cache{rdb: redis.NewClient(opt)}
}

// Enabled reports whether the cache is backed by a real Redis client.
func (c *Cache) Enabled() bool { return c.rdb != nil }

// Set encodes v as JSON and stores it under key with the given TTL.
func (c *Cache) Set(ctx context.Context, key string, v any, ttl time.Duration) error {
	if !c.Enabled() {
		return nil
	}
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return c.rdb.Set(ctx, key, data, ttl).Err()
}

// Get retrieves the value stored under key and decodes it into dest.
// Returns (false, nil) on a cache miss.
func (c *Cache) Get(ctx context.Context, key string, dest any) (bool, error) {
	if !c.Enabled() {
		return false, nil
	}
	data, err := c.rdb.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, json.Unmarshal(data, dest)
}

// Delete removes a key from the cache.
func (c *Cache) Delete(ctx context.Context, key string) error {
	if !c.Enabled() {
		return nil
	}
	return c.rdb.Del(ctx, key).Err()
}

// Close releases the Redis connection.
func (c *Cache) Close() error {
	if c.rdb != nil {
		return c.rdb.Close()
	}
	return nil
}
