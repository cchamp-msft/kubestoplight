package view

import (
	"strings"

	"charm.land/bubbles/v2/key"
	"charm.land/lipgloss/v2"
)

// KeyHelp defines a single keyboard shortcut hint.
type KeyHelp struct {
	Description string
	Keys        string
}

// RenderHelp renders the help bar from key bindings.
func RenderHelp(keys []key.Binding) string {
	var parts []string
	for _, k := range keys {
		h := k.Help()
		parts = append(parts,
			lipgloss.NewStyle().Bold(true).Render(h.Key)+" "+h.Desc,
		)
	}
	return helpStyle.Render(strings.Join(parts, "  |  "))
}

// RenderHeader renders the application header.
func RenderHeader(title string, clusters []string) string {
	subtitle := strings.Join(clusters, "  •  ")
	return lipgloss.JoinVertical(lipgloss.Left,
		headerStyle.Render(title),
		lipgloss.NewStyle().Foreground(lipgloss.Color("4")).Render(subtitle),
	)
}

// RenderEmpty renders an empty state message.
func RenderEmpty(width int, msg string) string {
	return emptyStyle.Width(width).Render(msg)
}
