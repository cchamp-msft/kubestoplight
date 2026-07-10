package model

import (
	"fmt"
	"io"
	"strings"
	"sync"
	"time"

	"charm.land/bubbles/v2/key"
	"charm.land/bubbles/v2/list"
	"charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"kubestoplight/clusters"
	"kubestoplight/polling"
	"kubestoplight/view"
)

// Focus indicates which panel currently has keyboard focus.
type Focus int

const (
	FocusSidebar Focus = iota
	FocusMain
)

type busyTickMsg struct{}

// clusterName implements list.Item.
type clusterName string

func (c clusterName) FilterValue() string { return string(c) }

// Model is the Bubble Tea v2 application model.
type Model struct {
	focus Focus

	clusters       *clusters.ClusterManager
	namespaceGroups []NamespaceGroup
	refreshErr     error

	// Per-cluster pod cache for multi-cluster accumulation
	clusterPods  map[string][]Pod
	clusterErr   map[string]error
	clusterReady map[string]bool
	pending      int
	mu           *sync.Mutex

	// Sidebar: cluster list
	clusterList list.Model

	// Dimensions
	width  int
	height int

	// Polling
	pollInterval time.Duration

	// Busy icon twinkle
	busyIconIndex int
}

// clusterDelegate implements list.ItemDelegate for cluster items.
type clusterDelegate struct {
	clusters *clusters.ClusterManager
}

func (d clusterDelegate) Render(w io.Writer, m list.Model, index int, item list.Item) {
	name := item.(clusterName)
	nameStr := string(name)

	var icon, clusterName string
	if strings.HasPrefix(nameStr, view.ClusterIconError+" ") {
		icon = view.ClusterIconError
		clusterName = strings.TrimPrefix(nameStr, view.ClusterIconError+" ")
	} else if strings.HasPrefix(nameStr, view.ClusterIconHealthy+" ") {
		icon = view.ClusterIconHealthy
		clusterName = strings.TrimPrefix(nameStr, view.ClusterIconHealthy+" ")
	} else if strings.HasPrefix(nameStr, view.ClusterIconLoading+" ") {
		icon = view.ClusterIconLoading
		clusterName = strings.TrimPrefix(nameStr, view.ClusterIconLoading+" ")
	} else {
		fmt.Fprint(w, lipgloss.NewStyle().PaddingLeft(1).Render(nameStr))
		return
	}

	var color string
	if d.clusters != nil {
		if cfgColor := d.clusters.GetClusterColor(clusterName); cfgColor != "" {
			color = cfgColor
		} else {
			color = view.ClusterNameColor(clusterName)
		}
	} else {
		color = view.ClusterNameColor(clusterName)
	}

	switch icon {
	case view.ClusterIconError:
		fmt.Fprint(w, lipgloss.NewStyle().Foreground(lipgloss.Color(view.ClusterColorError)).PaddingLeft(1).Render(icon+" "))
		fmt.Fprint(w, lipgloss.NewStyle().Foreground(lipgloss.Color(color)).Render(clusterName))
	case view.ClusterIconHealthy:
		fmt.Fprint(w, lipgloss.NewStyle().Foreground(lipgloss.Color(view.ClusterColorHealthy)).PaddingLeft(1).Render(icon+" "))
		fmt.Fprint(w, lipgloss.NewStyle().Foreground(lipgloss.Color(color)).Render(clusterName))
	default:
		fmt.Fprint(w, lipgloss.NewStyle().Foreground(lipgloss.Color(view.ClusterColorLoading)).PaddingLeft(1).Render(icon+" "))
		fmt.Fprint(w, lipgloss.NewStyle().Foreground(lipgloss.Color(color)).Render(clusterName))
	}
}

func (d clusterDelegate) Height() int       { return 1 }
func (d clusterDelegate) Spacing() int      { return 0 }
func (d clusterDelegate) Update(msg tea.Msg, m *list.Model) tea.Cmd { return nil }

// NewModel creates a new application model.
func NewModel(cm *clusters.ClusterManager, pollInterval time.Duration) Model {
	names := cm.ClusterNames()
	items := make([]list.Item, len(names))
	for i, n := range names {
		items[i] = clusterName(n)
	}

	m := Model{
		clusters:       cm,
		pollInterval:   pollInterval,
		focus:          FocusMain,
		clusterPods:    make(map[string][]Pod),
		clusterErr:     make(map[string]error),
		clusterReady:   make(map[string]bool),
		mu:             &sync.Mutex{},
	}

	// Initialize cluster list
	m.clusterList = list.New(items, clusterDelegate{clusters: cm}, 22, 10)
	m.clusterList.Title = "Clusters"

	return m
}

// Init implements tea.Model.
func (m Model) Init() tea.Cmd {
	return tea.Batch(
		tea.Every(m.pollInterval, func(t time.Time) tea.Msg {
			return polling.RefreshAllMsg{Time: t}
		}),
		busyTickCmd(),
	)
}

func busyTickCmd() tea.Cmd {
	return func() tea.Msg {
		time.Sleep(400 * time.Millisecond)
		return busyTickMsg{}
	}
}

// Update implements tea.Model.
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	// Handle specific keys before delegation so they don't get consumed
	// by the wrong sub-component or lost entirely.
	if keyMsg, ok := msg.(tea.KeyPressMsg); ok {
		switch keyMsg.String() {
	case "q", "ctrl+c":
			return m, tea.Quit
		case "tab":
			if m.focus == FocusSidebar {
				m.focus = FocusMain
			} else {
				m.focus = FocusSidebar
			}
			return m, nil
		}
	}

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil
	case polling.RefreshAllMsg:
		return m.refreshClusters()
	case polling.ClusterRefreshMsg:
		return m.handleClusterRefresh(msg)
	case tea.QuitMsg:
		return m, tea.Quit
	case busyTickMsg:
		m.busyIconIndex = (m.busyIconIndex + 1) % 3
		return m, busyTickCmd()
	}

	// Delegate to sub-models based on focus
	if m.focus == FocusSidebar {
		newM, cmd := m.clusterList.Update(msg)
		m.clusterList = newM
		return m, cmd
	}

	return m, nil
}

func (m Model) updateKeys(msg tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "q", "ctrl+c":
		return m, tea.Quit
	case "tab":
		if m.focus == FocusSidebar {
			m.focus = FocusMain
		} else {
			m.focus = FocusSidebar
		}
		return m, nil
	}
	return m, nil
}

func (m Model) refreshClusters() (tea.Model, tea.Cmd) {
	names := m.clusters.ClusterNames()
	cmds := make([]tea.Cmd, len(names))
	m.pending = len(names)
	// Mark all clusters as loading
	for _, name := range names {
		m.clusterReady[name] = false
	}
	for i, name := range names {
		cl := name
		cmds[i] = func() tea.Msg {
			cfg, err := m.clusters.GetConfig(cl)
			if err != nil {
				return polling.ClusterRefreshMsg{Cluster: cl, Err: err}
			}
			c, err := polling.NewClient(cfg)
			if err != nil {
				return polling.ClusterRefreshMsg{Cluster: cl, Err: err}
			}
			pods, err := c.ListPods()
			if err != nil {
				return polling.ClusterRefreshMsg{Cluster: cl, Err: err}
			}
			return polling.ClusterRefreshMsg{
				Cluster: cl,
				Pods:    pods,
				Err:     err,
			}
		}
	}
	return m, tea.Batch(cmds...)
}

func (m Model) handleClusterRefresh(msg polling.ClusterRefreshMsg) (tea.Model, tea.Cmd) {
	m.mu.Lock()
	if msg.Err != nil {
		m.clusterErr[msg.Cluster] = msg.Err
	} else {
		delete(m.clusterErr, msg.Cluster)
		pods := make([]Pod, 0, len(msg.Pods))
		for _, raw := range msg.Pods {
			pods = append(pods, ExtractPod(raw, msg.Cluster))
		}
		m.clusterPods[msg.Cluster] = pods
		m.clusterReady[msg.Cluster] = true
	}
	m.pending--
	allDone := m.pending <= 0
	m.mu.Unlock()

	if allDone {
		// Rebuild pod groups from all clusters
		var allPods []Pod
		for _, pods := range m.clusterPods {
			allPods = append(allPods, pods...)
		}
		m.namespaceGroups = GroupByNamespace(allPods, nil)
	}

	return m, nil
}

// View implements tea.Model.
func (m Model) View() tea.View {
	v := tea.NewView(m.render())
	v.AltScreen = true
	v.MouseMode = tea.MouseModeAllMotion
	v.WindowTitle = "kubestoplight"
	return v
}

func (m Model) render() string {
	if m.width == 0 {
		return "Waiting for window size..."
	}

	var b strings.Builder

	// Header
	header := view.RenderHeader("kubestoplight", m.clusters.ClusterNames())
	b.WriteString(header + "\n")

	// Main content: sidebar + table
	if m.width > 40 {
		sidebarWidth := 22
		mainWidth := m.width - sidebarWidth - 4

		sidebar := m.renderSidebar()
		main := m.renderMain(mainWidth)

		b.WriteString(view.JoinHorizontal(sidebar, main))
	} else {
		b.WriteString(m.renderMain(m.width))
	}

	// Status bar
	b.WriteString("\n" + m.renderHelp())

	return b.String()
}

func (m Model) renderSidebar() string {
	var items []list.Item
	names := m.clusters.ClusterNames()
	for _, name := range names {
		if err, ok := m.clusterErr[name]; ok && err != nil {
			items = append(items, clusterName(view.ClusterIconError+" "+name))
		} else if m.clusterReady[name] {
			items = append(items, clusterName(view.ClusterIconHealthy+" "+name))
		} else {
			items = append(items, clusterName(view.ClusterIconLoading+" "+name))
		}
	}
	m.clusterList.SetItems(items)
	return m.clusterList.View()
}

func (m Model) renderMain(width int) string {
	if len(m.namespaceGroups) == 0 {
		return view.RenderEmpty(width, "No namespaces found. Waiting for data...")
	}

	cards := make([]view.NSCardData, len(m.namespaceGroups))
	for i, ns := range m.namespaceGroups {
		var clusterColor string
		if cfgColor := m.clusters.GetClusterColor(ns.Cluster); cfgColor != "" {
			clusterColor = cfgColor
		} else {
			clusterColor = view.ClusterNameColor(ns.Cluster)
		}
		cards[i] = view.NSCardData{
			Name:         ns.Name,
			Cluster:      ns.Cluster,
			ClusterColor: clusterColor,
			TotalPods:    ns.ActivePods,
			ReadyPods:    ns.ReadyPods,
			Status:       view.NSStatus(ns.Status),
			FailedPods:   ns.StatusCounts[NsStatusFailed],
			BusyPods:     ns.StatusCounts[NsStatusBusy],
			BusyIcon:     view.BusyIcons[m.busyIconIndex],
			ChangingPods: ns.StatusCounts[NsStatusChanging],
			IdlePods:     ns.StatusCounts[NsStatusIdle],
		}
	}

	return view.RenderNamespaceCards(cards, width)
}

func (m Model) renderHelp() string {
	keys := []key.Binding{
		key.NewBinding(key.WithKeys("q"), key.WithHelp("q", "quit")),
		key.NewBinding(key.WithKeys("tab"), key.WithHelp("tab", "toggle focus")),
	}
	return view.RenderHelp(keys)
}
