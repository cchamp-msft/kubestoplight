package polling

import (
	"time"
)

// DefaultPollInterval is the default polling interval.
const DefaultPollInterval = 3 * time.Second

// DurationFromString parses a duration string like "3s" or "500ms".
func DurationFromString(s string) time.Duration {
	d, err := time.ParseDuration(s)
	if err != nil {
		return DefaultPollInterval
	}
	if d <= 0 {
		return DefaultPollInterval
	}
	return d
}
