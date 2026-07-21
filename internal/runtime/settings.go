package runtime

import (
	"github.com/mishamsk/mina/internal/appconfig"
	settingservice "github.com/mishamsk/mina/internal/services/settings"
)

func newSettingsSnapshot(snapshot appconfig.SettingsSnapshot) settingservice.Snapshot {
	groups := make([]settingservice.Group, 0, len(snapshot.Groups))
	for _, group := range snapshot.Groups {
		fields := make([]settingservice.Field, 0, len(group.Fields))
		for _, field := range group.Fields {
			fields = append(fields, settingservice.Field{
				Key: settingservice.Key(field.Key), Label: field.Label, Help: field.Help,
				Order: field.Order, Control: settingservice.ControlKind(field.Control),
				Value: field.Value, Source: settingservice.Source(field.Source),
			})
		}
		groups = append(groups, settingservice.Group{
			Key: group.Key, Label: group.Label, Order: group.Order, Fields: fields,
		})
	}

	return settingservice.Snapshot{
		ConfigFilePath: snapshot.ConfigFilePath,
		Groups:         groups,
	}
}
