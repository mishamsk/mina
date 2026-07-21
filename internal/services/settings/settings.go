package settings

// Key identifies one operational setting.
type Key string

// ControlKind identifies how one active setting value should be displayed.
type ControlKind string

// Source identifies the effective source of one active setting value.
type Source string

// Field reports one active setting and its backend-owned presentation metadata.
type Field struct {
	Key     Key
	Label   string
	Help    string
	Order   int
	Control ControlKind
	Value   string
	Source  Source
}

// Group is one ordered group of active settings.
type Group struct {
	Key    string
	Label  string
	Order  int
	Fields []Field
}

// Snapshot is the immutable settings view for one running process.
type Snapshot struct {
	ConfigFilePath string
	Groups         []Group
}

// Service owns operational-settings read use cases.
type Service struct {
	snapshot Snapshot
}

// NewService creates a read-only settings service.
func NewService(snapshot Snapshot) *Service {
	return &Service{snapshot: cloneSnapshot(snapshot)}
}

// Get returns the immutable settings snapshot for this process.
func (s *Service) Get() Snapshot {
	return cloneSnapshot(s.snapshot)
}

func cloneSnapshot(snapshot Snapshot) Snapshot {
	clone := snapshot
	clone.Groups = append([]Group(nil), snapshot.Groups...)
	for index := range clone.Groups {
		clone.Groups[index].Fields = append([]Field(nil), snapshot.Groups[index].Fields...)
	}
	return clone
}
