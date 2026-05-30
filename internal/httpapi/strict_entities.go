package httpapi

import (
	"context"

	"mina.local/mina/internal/httpapi/openapi"
	"mina.local/mina/internal/services"
	"mina.local/mina/internal/services/accounts"
	"mina.local/mina/internal/services/categories"
	"mina.local/mina/internal/services/members"
	"mina.local/mina/internal/services/tags"
)

func (s *strictServer) ListAccounts(ctx context.Context, request openapi.ListAccountsRequestObject) (openapi.ListAccountsResponseObject, error) {
	params := request.Params
	accountList, err := s.deps.Accounts.List(ctx, accounts.ListOptions{
		IncludeHidden:     boolParam(params.IncludeHidden),
		IncludeTombstoned: boolParam(params.IncludeTombstoned),
		List: listOptionsFromParams(
			params.Sort,
			params.SortDir,
			params.Limit,
			params.Offset,
			services.SortKeyFQN,
		),
	})
	if err != nil {
		return nil, err
	}

	return openapi.ListAccounts200JSONResponse{Accounts: accountAPIResponses(accountList)}, nil
}

func (s *strictServer) CreateAccount(ctx context.Context, request openapi.CreateAccountRequestObject) (openapi.CreateAccountResponseObject, error) {
	if request.Body == nil {
		return nil, services.InvalidRequest("invalid JSON request body")
	}
	account, err := s.deps.Accounts.Create(ctx, accounts.CreateInput{
		FQN:            request.Body.Fqn,
		IsHidden:       request.Body.IsHidden != nil && *request.Body.IsHidden,
		Currency:       request.Body.Currency,
		ExternalID:     request.Body.ExternalId,
		ExternalSystem: request.Body.ExternalSystem,
	})
	if err != nil {
		return nil, err
	}

	return openapi.CreateAccount201JSONResponse(accountAPIResponse(account)), nil
}

func (s *strictServer) DeleteAccount(ctx context.Context, request openapi.DeleteAccountRequestObject) (openapi.DeleteAccountResponseObject, error) {
	if err := positivePathID(request.AccountId, "account_id"); err != nil {
		return nil, err
	}
	if err := s.deps.Accounts.Delete(ctx, request.AccountId); err != nil {
		return nil, err
	}

	return openapi.DeleteAccount204Response{}, nil
}

func (s *strictServer) GetAccount(ctx context.Context, request openapi.GetAccountRequestObject) (openapi.GetAccountResponseObject, error) {
	if err := positivePathID(request.AccountId, "account_id"); err != nil {
		return nil, err
	}
	account, err := s.deps.Accounts.Get(ctx, request.AccountId, boolParam(request.Params.IncludeTombstoned))
	if err != nil {
		return nil, err
	}

	return openapi.GetAccount200JSONResponse(accountAPIResponse(account)), nil
}

func (s *strictServer) UpdateAccount(ctx context.Context, request openapi.UpdateAccountRequestObject) (openapi.UpdateAccountResponseObject, error) {
	if err := positivePathID(request.AccountId, "account_id"); err != nil {
		return nil, err
	}
	if request.Body == nil {
		return nil, services.InvalidRequest("invalid JSON request body")
	}
	if !requiredBoolJSONFieldPresent(ctx, "is_hidden") {
		return nil, services.InvalidRequest("is_hidden is required")
	}
	isHidden := request.Body.IsHidden
	account, err := s.deps.Accounts.UpdateMutable(ctx, request.AccountId, accounts.UpdateInput{
		IsHidden:       &isHidden,
		ExternalID:     request.Body.ExternalId,
		ExternalSystem: request.Body.ExternalSystem,
	})
	if err != nil {
		return nil, err
	}

	return openapi.UpdateAccount200JSONResponse(accountAPIResponse(account)), nil
}

func (s *strictServer) ListCategories(ctx context.Context, request openapi.ListCategoriesRequestObject) (openapi.ListCategoriesResponseObject, error) {
	params := request.Params
	categoryList, err := s.deps.Categories.List(ctx, categories.ListOptions{
		IncludeHidden:     boolParam(params.IncludeHidden),
		IncludeTombstoned: boolParam(params.IncludeTombstoned),
		List: listOptionsFromParams(
			params.Sort,
			params.SortDir,
			params.Limit,
			params.Offset,
			services.SortKeyFQN,
		),
	})
	if err != nil {
		return nil, err
	}

	return openapi.ListCategories200JSONResponse{Categories: categoryAPIResponses(categoryList)}, nil
}

func (s *strictServer) CreateCategory(ctx context.Context, request openapi.CreateCategoryRequestObject) (openapi.CreateCategoryResponseObject, error) {
	if request.Body == nil {
		return nil, services.InvalidRequest("invalid JSON request body")
	}
	category, err := s.deps.Categories.Create(ctx, categories.CreateInput{
		FQN:      request.Body.Fqn,
		IsHidden: request.Body.IsHidden != nil && *request.Body.IsHidden,
	})
	if err != nil {
		return nil, err
	}

	return openapi.CreateCategory201JSONResponse(categoryAPIResponse(category)), nil
}

func (s *strictServer) DeleteCategory(ctx context.Context, request openapi.DeleteCategoryRequestObject) (openapi.DeleteCategoryResponseObject, error) {
	if err := positivePathID(request.CategoryId, "category_id"); err != nil {
		return nil, err
	}
	if err := s.deps.Categories.Delete(ctx, request.CategoryId); err != nil {
		return nil, err
	}

	return openapi.DeleteCategory204Response{}, nil
}

func (s *strictServer) GetCategory(ctx context.Context, request openapi.GetCategoryRequestObject) (openapi.GetCategoryResponseObject, error) {
	if err := positivePathID(request.CategoryId, "category_id"); err != nil {
		return nil, err
	}
	category, err := s.deps.Categories.Get(ctx, request.CategoryId, boolParam(request.Params.IncludeTombstoned))
	if err != nil {
		return nil, err
	}

	return openapi.GetCategory200JSONResponse(categoryAPIResponse(category)), nil
}

func (s *strictServer) UpdateCategory(ctx context.Context, request openapi.UpdateCategoryRequestObject) (openapi.UpdateCategoryResponseObject, error) {
	if err := positivePathID(request.CategoryId, "category_id"); err != nil {
		return nil, err
	}
	if request.Body == nil {
		return nil, services.InvalidRequest("invalid JSON request body")
	}
	if !requiredBoolJSONFieldPresent(ctx, "is_hidden") {
		return nil, services.InvalidRequest("is_hidden is required")
	}
	isHidden := request.Body.IsHidden
	category, err := s.deps.Categories.UpdateHidden(ctx, request.CategoryId, &isHidden)
	if err != nil {
		return nil, err
	}

	return openapi.UpdateCategory200JSONResponse(categoryAPIResponse(category)), nil
}

func (s *strictServer) ListMembers(ctx context.Context, request openapi.ListMembersRequestObject) (openapi.ListMembersResponseObject, error) {
	params := request.Params
	memberList, err := s.deps.Members.List(ctx, members.ListOptions{
		IncludeTombstoned: boolParam(params.IncludeTombstoned),
		List: listOptionsFromParams(
			params.Sort,
			params.SortDir,
			params.Limit,
			params.Offset,
			services.SortKeyName,
		),
	})
	if err != nil {
		return nil, err
	}

	return openapi.ListMembers200JSONResponse{Members: memberAPIResponses(memberList)}, nil
}

func (s *strictServer) CreateMember(ctx context.Context, request openapi.CreateMemberRequestObject) (openapi.CreateMemberResponseObject, error) {
	if request.Body == nil {
		return nil, services.InvalidRequest("invalid JSON request body")
	}
	member, err := s.deps.Members.Create(ctx, members.CreateInput{Name: request.Body.Name})
	if err != nil {
		return nil, err
	}

	return openapi.CreateMember201JSONResponse(memberAPIResponse(member)), nil
}

func (s *strictServer) DeleteMember(ctx context.Context, request openapi.DeleteMemberRequestObject) (openapi.DeleteMemberResponseObject, error) {
	if err := positivePathID(request.MemberId, "member_id"); err != nil {
		return nil, err
	}
	if err := s.deps.Members.Delete(ctx, request.MemberId); err != nil {
		return nil, err
	}

	return openapi.DeleteMember204Response{}, nil
}

func (s *strictServer) GetMember(ctx context.Context, request openapi.GetMemberRequestObject) (openapi.GetMemberResponseObject, error) {
	if err := positivePathID(request.MemberId, "member_id"); err != nil {
		return nil, err
	}
	member, err := s.deps.Members.Get(ctx, request.MemberId, boolParam(request.Params.IncludeTombstoned))
	if err != nil {
		return nil, err
	}

	return openapi.GetMember200JSONResponse(memberAPIResponse(member)), nil
}

func (s *strictServer) UpdateMember(ctx context.Context, request openapi.UpdateMemberRequestObject) (openapi.UpdateMemberResponseObject, error) {
	if err := positivePathID(request.MemberId, "member_id"); err != nil {
		return nil, err
	}
	if request.Body == nil {
		return nil, services.InvalidRequest("invalid JSON request body")
	}
	member, err := s.deps.Members.UpdateName(ctx, request.MemberId, members.UpdateInput{Name: request.Body.Name})
	if err != nil {
		return nil, err
	}

	return openapi.UpdateMember200JSONResponse(memberAPIResponse(member)), nil
}

func (s *strictServer) ListTags(ctx context.Context, request openapi.ListTagsRequestObject) (openapi.ListTagsResponseObject, error) {
	params := request.Params
	tagList, err := s.deps.Tags.List(ctx, tags.ListOptions{
		IncludeHidden:     boolParam(params.IncludeHidden),
		IncludeTombstoned: boolParam(params.IncludeTombstoned),
		List: listOptionsFromParams(
			params.Sort,
			params.SortDir,
			params.Limit,
			params.Offset,
			services.SortKeyFQN,
		),
	})
	if err != nil {
		return nil, err
	}

	return openapi.ListTags200JSONResponse{Tags: tagAPIResponses(tagList)}, nil
}

func (s *strictServer) CreateTag(ctx context.Context, request openapi.CreateTagRequestObject) (openapi.CreateTagResponseObject, error) {
	if request.Body == nil {
		return nil, services.InvalidRequest("invalid JSON request body")
	}
	tag, err := s.deps.Tags.Create(ctx, tags.CreateInput{
		FQN:      request.Body.Fqn,
		IsHidden: request.Body.IsHidden != nil && *request.Body.IsHidden,
	})
	if err != nil {
		return nil, err
	}

	return openapi.CreateTag201JSONResponse(tagAPIResponse(tag)), nil
}

func (s *strictServer) DeleteTag(ctx context.Context, request openapi.DeleteTagRequestObject) (openapi.DeleteTagResponseObject, error) {
	if err := positivePathID(request.TagId, "tag_id"); err != nil {
		return nil, err
	}
	if err := s.deps.Tags.Delete(ctx, request.TagId); err != nil {
		return nil, err
	}

	return openapi.DeleteTag204Response{}, nil
}

func (s *strictServer) GetTag(ctx context.Context, request openapi.GetTagRequestObject) (openapi.GetTagResponseObject, error) {
	if err := positivePathID(request.TagId, "tag_id"); err != nil {
		return nil, err
	}
	tag, err := s.deps.Tags.Get(ctx, request.TagId, boolParam(request.Params.IncludeTombstoned))
	if err != nil {
		return nil, err
	}

	return openapi.GetTag200JSONResponse(tagAPIResponse(tag)), nil
}

func (s *strictServer) UpdateTag(ctx context.Context, request openapi.UpdateTagRequestObject) (openapi.UpdateTagResponseObject, error) {
	if err := positivePathID(request.TagId, "tag_id"); err != nil {
		return nil, err
	}
	if request.Body == nil {
		return nil, services.InvalidRequest("invalid JSON request body")
	}
	if !requiredBoolJSONFieldPresent(ctx, "is_hidden") {
		return nil, services.InvalidRequest("is_hidden is required")
	}
	isHidden := request.Body.IsHidden
	tag, err := s.deps.Tags.UpdateHidden(ctx, request.TagId, &isHidden)
	if err != nil {
		return nil, err
	}

	return openapi.UpdateTag200JSONResponse(tagAPIResponse(tag)), nil
}

func boolParam(value *bool) bool {
	return value != nil && *value
}

func requiredBoolJSONFieldPresent(ctx context.Context, name string) bool {
	return jsonFieldStateFromContext(ctx, name) == jsonFieldValue
}

func accountAPIResponse(account accounts.Account) openapi.Account {
	return openapi.Account{
		AccountId:      account.ID,
		Fqn:            account.FQN,
		Kind:           account.Kind,
		IsHidden:       account.IsHidden,
		Currency:       account.Currency,
		ExternalId:     account.ExternalID,
		ExternalSystem: account.ExternalSystem,
		ParentFqn:      account.ParentFQN,
		Name:           account.Name,
		Level:          account.Level,
		CreatedAt:      account.CreatedAt,
		UpdatedAt:      account.UpdatedAt,
		TombstonedAt:   account.TombstonedAt,
	}
}

func accountAPIResponses(accounts []accounts.Account) []openapi.Account {
	responses := make([]openapi.Account, 0, len(accounts))
	for _, account := range accounts {
		responses = append(responses, accountAPIResponse(account))
	}

	return responses
}

func categoryAPIResponse(category categories.Category) openapi.Category {
	return openapi.Category{
		CategoryId:   category.ID,
		Fqn:          category.FQN,
		IsHidden:     category.IsHidden,
		ParentFqn:    category.ParentFQN,
		Name:         category.Name,
		Level:        category.Level,
		CreatedAt:    category.CreatedAt,
		UpdatedAt:    category.UpdatedAt,
		TombstonedAt: category.TombstonedAt,
	}
}

func categoryAPIResponses(categories []categories.Category) []openapi.Category {
	responses := make([]openapi.Category, 0, len(categories))
	for _, category := range categories {
		responses = append(responses, categoryAPIResponse(category))
	}

	return responses
}

func memberAPIResponse(member members.Member) openapi.Member {
	return openapi.Member{
		MemberId:     member.ID,
		Name:         member.Name,
		CreatedAt:    member.CreatedAt,
		UpdatedAt:    member.UpdatedAt,
		TombstonedAt: member.TombstonedAt,
	}
}

func memberAPIResponses(members []members.Member) []openapi.Member {
	responses := make([]openapi.Member, 0, len(members))
	for _, member := range members {
		responses = append(responses, memberAPIResponse(member))
	}

	return responses
}

func tagAPIResponse(tag tags.Tag) openapi.Tag {
	return openapi.Tag{
		TagId:        tag.ID,
		Fqn:          tag.FQN,
		IsHidden:     tag.IsHidden,
		ParentFqn:    tag.ParentFQN,
		Name:         tag.Name,
		Level:        tag.Level,
		CreatedAt:    tag.CreatedAt,
		UpdatedAt:    tag.UpdatedAt,
		TombstonedAt: tag.TombstonedAt,
	}
}

func tagAPIResponses(tags []tags.Tag) []openapi.Tag {
	responses := make([]openapi.Tag, 0, len(tags))
	for _, tag := range tags {
		responses = append(responses, tagAPIResponse(tag))
	}

	return responses
}
