package view

import (
	"charm.land/lipgloss/v2"
)

var (
	headerStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("6")).
			Align(lipgloss.Center)

	panelBorderStyle = lipgloss.NewStyle().
				BorderStyle(lipgloss.RoundedBorder()).
				BorderForeground(lipgloss.Color("5")).
				Padding(0, 1)

	clusterStyle = lipgloss.NewStyle().PaddingLeft(1)
	clusterErrStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("9")).PaddingLeft(1)

	statusColors = map[string]string{
		"Idle":     "2",
		"Busy":     "208",
		"Changing": "11",
		"Failed":   "9",
	}

	emptyStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("8")).
			Align(lipgloss.Center).
			Italic(true)

	helpStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("7")).
			Padding(0, 1)
)

// Cluster status icons.
const (
	ClusterIconLoading  = "●"
	ClusterIconHealthy  = "✓"
	ClusterIconError    = "✗"
)

// Cluster status colors.
const (
	ClusterColorLoading  = "8"
	ClusterColorHealthy  = "2"
	ClusterColorError    = "9"
)

// Cluster name colors for deterministic color assignment.
var clusterNameColors = []string{
	"6",   // cyan
	"4",   // blue/teal
	"8",   // gray
	"5",   // purple
	"13",  // magenta
	"7",   // white
	"10",  // bright green
	"12",  // bright red
	"3",   // yellow
	"9",   // red
	"11",  // yellow
	"14",  // bright cyan
}

// StatusStyle returns the lipgloss style for a pod status string.
func StatusStyle(s string) lipgloss.Style {
	if color, ok := statusColors[s]; ok {
		return lipgloss.NewStyle().Foreground(lipgloss.Color(color))
	}
	return lipgloss.NewStyle().Foreground(lipgloss.Color("8"))
}

// JoinHorizontal lays out two strings side by side.
func JoinHorizontal(left, right string) string {
	return lipgloss.JoinHorizontal(lipgloss.Top,
		panelBorderStyle.Render(left),
		lipgloss.NewStyle().Render(right),
	)
}

// ClusterNameColor returns a deterministic lipgloss color for a cluster name.
// Same cluster always gets the same color.
func ClusterNameColor(name string) string {
	var h uint64
	for _, c := range name {
		h = h*31 + uint64(c)
	}
	return clusterNameColors[h%uint64(len(clusterNameColors))]
}
