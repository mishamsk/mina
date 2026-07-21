package httpapi

import (
	"context"

	"github.com/mishamsk/mina/internal/httpapi/openapi"
	settingservice "github.com/mishamsk/mina/internal/services/settings"
)

func (s *strictServer) GetSettings(
	_ context.Context,
	_ openapi.GetSettingsRequestObject,
) (openapi.GetSettingsResponseObject, error) {
	snapshot := s.deps.Settings.Get()
	return openapi.GetSettings200JSONResponse(settingsResponse(snapshot)), nil
}

func settingsResponse(snapshot settingservice.Snapshot) openapi.SettingsResponse {
	groups := make([]openapi.SettingGroup, 0, len(snapshot.Groups))
	for _, group := range snapshot.Groups {
		fields := make([]openapi.SettingField, 0, len(group.Fields))
		for _, field := range group.Fields {
			fields = append(fields, openapi.SettingField{
				SettingKey: openapi.SettingKey(field.Key), Label: field.Label, Help: field.Help,
				Order: field.Order, Control: openapi.SettingControlKind(field.Control),
				Value: field.Value, Source: openapi.SettingSource(field.Source),
			})
		}
		groups = append(groups, openapi.SettingGroup{
			GroupKey: group.Key, Label: group.Label, Order: group.Order, Fields: fields,
		})
	}

	return openapi.SettingsResponse{ConfigFilePath: snapshot.ConfigFilePath, Groups: groups}
}
