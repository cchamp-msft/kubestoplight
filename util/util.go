package util

import (
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

// Truncate truncates s to max runes, adding "…" if truncated.
func Truncate(s string, max int) string {
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	if max <= 3 {
		return s[:max]
	}
	return s[:max-3] + "..."
}

// FormatAge formats a duration for display.
func FormatAge(d time.Duration) string {
	if d < time.Second {
		return "0s"
	}
	if d < time.Minute {
		return d.Round(time.Second).String()
	}
	if d < time.Hour {
		return d.Round(time.Minute).String()
	}
	days := int(d.Hours() / 24)
	if days < 7 {
		return fmt.Sprintf("%dd%dh", days, int(d.Hours())%24)
	}
	weeks := days / 7
	remain := days % 7
	if remain == 0 {
		return fmt.Sprintf("%dw", weeks)
	}
	return fmt.Sprintf("%dw%dd", weeks, remain)
}

// SplitColumns splits a string into columns of roughly equal width.
func SplitColumns(s string, cols int) []string {
	runes := []rune(s)
	n := len(runes)
	if n == 0 {
		return nil
	}
	perCol := (n + cols - 1) / cols
	result := make([]string, cols)
	for i := 0; i < cols; i++ {
		start := i * perCol
		end := start + perCol
		if end > n {
			end = n
		}
		result[i] = string(runes[start:end])
	}
	// Trim trailing empty columns
	for len(result) > 0 && result[len(result)-1] == "" {
		result = result[:len(result)-1]
	}
	return result
}

// PadRight pads s to width with spaces, truncating if necessary.
func PadRight(s string, width int) string {
	r := []rune(s)
	if len(r) >= width {
		return string(r[:width])
	}
	return s + strings.Repeat(" ", width-len(r))
}
