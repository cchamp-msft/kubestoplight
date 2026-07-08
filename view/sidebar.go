package view

import (
	"strings"
)

// RenderSidebar renders the cluster list sidebar.
func RenderSidebar(clusters []string, errors map[string]error) string {
	var b strings.Builder
	b.WriteString("Clusters\n")
	b.WriteString(panelBorderStyle.Render(strings.Repeat("─", 20)) + "\n\n")

	for _, name := range clusters {
		if err, ok := errors[name]; ok && err != nil {
			b.WriteString(clusterErrStyle.Render("✗ " + name + ": " + err.Error()) + "\n")
		} else {
			b.WriteString(clusterStyle.Render("● " + name) + "\n")
		}
	}

	return strings.TrimRight(b.String(), "\n")
}
