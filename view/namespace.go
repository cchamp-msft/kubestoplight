package view

import (
	"fmt"
	"strings"

	"charm.land/lipgloss/v2"
)

// NSStatus represents the aggregate status of a namespace.
type NSStatus int

const (
	NSStatusIdle NSStatus = iota
	NSStatusBusy
	NSStatusChanging
	NSStatusFailed
)

var BusyIcons = []string{"●", "◉", "◎"}
const BusyIconColor = "15"

// NSCardData holds all data needed to render a namespace card.
type NSCardData struct {
	Name         string
	Cluster      string
	ClusterColor string
	TotalPods    int
	ReadyPods    int
	Status       NSStatus
	FailedPods   int
	BusyPods     int
	BusyIcon     string
	ChangingPods int
	IdlePods     int
}

// statusBorderColors maps namespace status to border colors.
var statusBorderColors = map[NSStatus]string{
	NSStatusFailed:   "9",
	NSStatusBusy:     "2",
	NSStatusChanging: "208",
	NSStatusIdle:     "2",
}

// statusForegroundColors maps namespace status to text colors.
var statusForegroundColors = map[NSStatus]string{
	NSStatusFailed:   "9",
	NSStatusBusy:     "2",
	NSStatusChanging: "208",
	NSStatusIdle:     "2",
}

const minCardWidth = 28
const maxPerRow = 6
const cardGap = 0

// RenderNamespaceCards renders all namespace cards in a grid layout.
func RenderNamespaceCards(namespaces []NSCardData, overallWidth int) string {
	if len(namespaces) == 0 {
		return ""
	}

	maxCardWidth := 40

	cols := (overallWidth + cardGap) / (maxCardWidth + cardGap)
	if cols < 1 {
		cols = 1
	}
	if cols > maxPerRow {
		cols = maxPerRow
	}

	cardContentWidth := (overallWidth - cardGap*(cols-1)) / cols
	if cardContentWidth > maxCardWidth {
		cardContentWidth = maxCardWidth
	}
	if cardContentWidth < minCardWidth {
		cardContentWidth = minCardWidth
	}

	// Render each card.
	cards := make([]string, len(namespaces))
	for i, ns := range namespaces {
		statusColor := statusBorderColors[ns.Status]
		card := lipgloss.NewStyle().
			BorderStyle(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color(statusColor)).
			Padding(0, 1).
			Width(cardContentWidth).
			Render(renderNamespaceCardContent(ns))
		cards[i] = card
	}

	// Group into rows and join horizontally with gap.
	var rowBlocks []string
	for i := 0; i < len(cards); i += cols {
		end := i + cols
		if end > len(cards) {
			end = len(cards)
		}
		var rowCards []string
		for j, c := range cards[i:end] {
			rowCards = append(rowCards, c)
			if j < len(cards[i:end])-1 {
				rowCards = append(rowCards, strings.Repeat(" ", cardGap))
			}
		}
		rowBlocks = append(rowBlocks, lipgloss.JoinHorizontal(lipgloss.Top, rowCards...))
	}

	var b strings.Builder
	b.WriteString(lipgloss.JoinVertical(lipgloss.Top, rowBlocks...))

	return b.String()
}

func renderNamespaceCardContent(ns NSCardData) string {
	var b strings.Builder
	b.WriteString(renderNamespaceHeader(ns) + "\n")
	b.WriteString(renderProgressBar(ns) + "\n")
	b.WriteString(renderStats(ns))
	return b.String()
}

func renderNamespaceHeader(ns NSCardData) string {
	statusColor := statusForegroundColors[ns.Status]

	var header strings.Builder
	header.WriteString(lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color(statusColor)).Render("● " + ns.Name))
	if ns.Cluster != "" {
		header.WriteString(" [")
		if ns.ClusterColor != "" {
			header.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color(ns.ClusterColor)).Render(ns.Cluster))
		} else {
			header.WriteString(ns.Cluster)
		}
		header.WriteString("]")
	}

	return header.String()
}

func renderProgressBar(ns NSCardData) string {
	if ns.TotalPods == 0 {
		return lipgloss.NewStyle().Foreground(lipgloss.Color("7")).Render("─ 0/0 pods ready")
	}

	ratio := float64(ns.ReadyPods) / float64(ns.TotalPods)
	bars := 12
	filled := int(float64(bars) * ratio + 0.5)
	if filled > bars {
		filled = bars
	}

	var bar strings.Builder
	bar.WriteRune('█')
	for i := 0; i < filled-1; i++ {
		bar.WriteRune('█')
	}
	for i := filled; i < bars; i++ {
		bar.WriteRune('░')
	}

	text := fmt.Sprintf(" %s %d/%d pods", bar.String(), ns.ReadyPods, ns.TotalPods)
	return lipgloss.NewStyle().Foreground(lipgloss.Color("7")).Render(text)
}

func renderStats(ns NSCardData) string {
	var parts []string

	if ns.FailedPods > 0 {
		parts = append(parts,
			lipgloss.JoinHorizontal(lipgloss.Top,
				lipgloss.NewStyle().Foreground(lipgloss.Color("9")).Render(fmt.Sprintf("✗ %d", ns.FailedPods)),
				lipgloss.NewStyle().Foreground(lipgloss.Color("9")).Render(" fail "),
			),
		)
	}
	if ns.BusyPods > 0 {
		parts = append(parts,
			lipgloss.JoinHorizontal(lipgloss.Top,
				lipgloss.NewStyle().Foreground(lipgloss.Color(BusyIconColor)).Render(fmt.Sprintf("%s %d", ns.BusyIcon, ns.BusyPods)),
				lipgloss.NewStyle().Foreground(lipgloss.Color(BusyIconColor)).Render(" busy "),
			),
		)
	}
	if ns.ChangingPods > 0 {
		parts = append(parts,
			lipgloss.JoinHorizontal(lipgloss.Top,
				lipgloss.NewStyle().Foreground(lipgloss.Color("208")).Render(fmt.Sprintf("◆ %d", ns.ChangingPods)),
				lipgloss.NewStyle().Foreground(lipgloss.Color("208")).Render(" chang "),
			),
		)
	}
	if ns.IdlePods > 0 {
		parts = append(parts,
			lipgloss.JoinHorizontal(lipgloss.Top,
				lipgloss.NewStyle().Foreground(lipgloss.Color("2")).Render(fmt.Sprintf("● %d", ns.IdlePods)),
				lipgloss.NewStyle().Foreground(lipgloss.Color("2")).Render(" idle "),
			),
		)
	}

	if len(parts) == 0 {
		return lipgloss.NewStyle().Foreground(lipgloss.Color("7")).Render(" no pods")
	}

	return lipgloss.JoinHorizontal(lipgloss.Top, parts...)
}
