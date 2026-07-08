package httpapi

import (
	"context"
	"time"

	"github.com/mishamsk/mina/internal/httpapi/openapi"
	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/accounts"
	"github.com/mishamsk/mina/internal/services/categories"
	"github.com/mishamsk/mina/internal/services/members"
	"github.com/mishamsk/mina/internal/services/tags"
	"github.com/mishamsk/mina/internal/services/values"
	"github.com/oapi-codegen/nullable"
)

func (s *strictServer) ListAccounts(ctx context.Context, request openapi.ListAccountsRequestObject) (openapi.ListAccountsResponseObject, error) {
	params := request.Params
	accountList, err := s.deps.Accounts.List(ctx, accounts.ListOptions{
		IncludeHidden:     boolParam(params.IncludeHidden),
		IncludeTombstoned: boolParam(params.IncludeTombstoned),
		AccountType:       accountTypeParam(params.AccountType),
		IsFeatured:        params.IsFeatured,
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

	return openapi.ListAccounts200JSONResponse{
		Accounts:   accountAPIResponses(accountList.Items),
		TotalCount: accountList.TotalCount,
	}, nil
}

func (s *strictServer) ListAccountBalances(ctx context.Context, request openapi.ListAccountBalancesRequestObject) (openapi.ListAccountBalancesResponseObject, error) {
	balances, err := s.deps.Accounts.ListBalances(ctx, accounts.BalanceListOptions{
		IncludeHidden: boolParam(request.Params.IncludeHidden),
		AccountIDs:    cloneOptionalInt64Slice(request.Params.AccountIds),
	})
	if err != nil {
		return nil, err
	}

	currentLimits, err := s.deps.CreditLimits.CurrentByAccounts(ctx, accountIDsFromBalances(balances), values.LocalCivilDateFromTime(s.deps.clock().Now()))
	if err != nil {
		return nil, err
	}

	return openapi.ListAccountBalances200JSONResponse{
		Balances: accountBalanceAPIResponses(balances, currentLimits),
	}, nil
}

func (s *strictServer) ListAccountGroups(ctx context.Context, request openapi.ListAccountGroupsRequestObject) (openapi.ListAccountGroupsResponseObject, error) {
	groups, err := s.deps.Accounts.GroupStates(ctx, boolParam(request.Params.IncludeHidden))
	if err != nil {
		return nil, err
	}

	return openapi.ListAccountGroups200JSONResponse{
		Groups: groupStateAPIResponses(groups),
	}, nil
}

func accountTypeParam(value *openapi.AccountType) *accounts.AccountType {
	if value == nil {
		return nil
	}
	accountType := accounts.AccountType(*value)
	return &accountType
}

func (s *strictServer) CreateAccount(ctx context.Context, request openapi.CreateAccountRequestObject) (openapi.CreateAccountResponseObject, error) {
	account, err := s.deps.Accounts.Create(ctx, accounts.CreateInput{
		FQN:            request.Body.Fqn,
		AccountType:    accounts.AccountType(request.Body.AccountType),
		IsHidden:       request.Body.IsHidden != nil && *request.Body.IsHidden,
		IsFeatured:     request.Body.IsFeatured != nil && *request.Body.IsFeatured,
		Currency:       request.Body.Currency,
		ExternalID:     request.Body.ExternalId,
		ExternalSystem: request.Body.ExternalSystem,
	})
	if err != nil {
		return nil, err
	}

	return openapi.CreateAccount201JSONResponse(accountAPIResponse(account)), nil
}

func (s *strictServer) RestructureAccounts(ctx context.Context, request openapi.RestructureAccountsRequestObject) (openapi.RestructureAccountsResponseObject, error) {
	movedCount, err := s.deps.Accounts.Restructure(ctx, request.Body.FromFqn, request.Body.ToFqn)
	if err != nil {
		return nil, err
	}

	return openapi.RestructureAccounts200JSONResponse{MovedCount: movedCount}, nil
}

func (s *strictServer) SetAccountHiddenByPath(ctx context.Context, request openapi.SetAccountHiddenByPathRequestObject) (openapi.SetAccountHiddenByPathResponseObject, error) {
	updatedCount, err := s.deps.Accounts.SetHiddenByPath(ctx, request.Body.PathFqn, request.Body.IsHidden)
	if err != nil {
		return nil, err
	}

	return openapi.SetAccountHiddenByPath200JSONResponse{UpdatedCount: updatedCount}, nil
}

func (s *strictServer) DeleteAccount(ctx context.Context, request openapi.DeleteAccountRequestObject) (openapi.DeleteAccountResponseObject, error) {
	if err := s.deps.Accounts.Delete(ctx, request.AccountId); err != nil {
		return nil, err
	}

	return openapi.DeleteAccount204Response{}, nil
}

func (s *strictServer) GetAccount(ctx context.Context, request openapi.GetAccountRequestObject) (openapi.GetAccountResponseObject, error) {
	account, err := s.deps.Accounts.Get(ctx, request.AccountId, boolParam(request.Params.IncludeTombstoned))
	if err != nil {
		return nil, err
	}

	return openapi.GetAccount200JSONResponse(accountAPIResponse(account)), nil
}

func (s *strictServer) UpdateAccount(ctx context.Context, request openapi.UpdateAccountRequestObject) (openapi.UpdateAccountResponseObject, error) {
	account, err := s.deps.Accounts.UpdateMutable(ctx, request.AccountId, accounts.UpdateInput{
		IsHidden:       request.Body.IsHidden,
		IsFeatured:     request.Body.IsFeatured,
		ExternalID:     optionalNullableString(request.Body.ExternalId),
		ExternalSystem: optionalNullableString(request.Body.ExternalSystem),
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
		EconomicIntents:   categoryEconomicIntentsFromAPI(params.EconomicIntent),
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

	return openapi.ListCategories200JSONResponse{
		Categories: categoryAPIResponses(categoryList.Items),
		TotalCount: categoryList.TotalCount,
	}, nil
}

func (s *strictServer) ListCategoryGroups(ctx context.Context, request openapi.ListCategoryGroupsRequestObject) (openapi.ListCategoryGroupsResponseObject, error) {
	groups, err := s.deps.Categories.GroupStates(ctx, boolParam(request.Params.IncludeHidden))
	if err != nil {
		return nil, err
	}

	return openapi.ListCategoryGroups200JSONResponse{
		Groups: groupStateAPIResponses(groups),
	}, nil
}

func (s *strictServer) CreateCategory(ctx context.Context, request openapi.CreateCategoryRequestObject) (openapi.CreateCategoryResponseObject, error) {
	category, err := s.deps.Categories.Create(ctx, categories.CreateInput{
		FQN:            request.Body.Fqn,
		EconomicIntent: categories.CategoryEconomicIntent(request.Body.EconomicIntent),
		IsHidden:       request.Body.IsHidden != nil && *request.Body.IsHidden,
	})
	if err != nil {
		return nil, err
	}

	return openapi.CreateCategory201JSONResponse(categoryAPIResponse(category)), nil
}

func (s *strictServer) RestructureCategories(ctx context.Context, request openapi.RestructureCategoriesRequestObject) (openapi.RestructureCategoriesResponseObject, error) {
	movedCount, err := s.deps.Categories.Restructure(ctx, request.Body.FromFqn, request.Body.ToFqn)
	if err != nil {
		return nil, err
	}

	return openapi.RestructureCategories200JSONResponse{MovedCount: movedCount}, nil
}

func (s *strictServer) SetCategoryHiddenByPath(ctx context.Context, request openapi.SetCategoryHiddenByPathRequestObject) (openapi.SetCategoryHiddenByPathResponseObject, error) {
	updatedCount, err := s.deps.Categories.SetHiddenByPath(ctx, request.Body.PathFqn, request.Body.IsHidden)
	if err != nil {
		return nil, err
	}

	return openapi.SetCategoryHiddenByPath200JSONResponse{UpdatedCount: updatedCount}, nil
}

func (s *strictServer) DeleteCategory(ctx context.Context, request openapi.DeleteCategoryRequestObject) (openapi.DeleteCategoryResponseObject, error) {
	if err := s.deps.Categories.Delete(ctx, request.CategoryId); err != nil {
		return nil, err
	}

	return openapi.DeleteCategory204Response{}, nil
}

func (s *strictServer) GetCategory(ctx context.Context, request openapi.GetCategoryRequestObject) (openapi.GetCategoryResponseObject, error) {
	category, err := s.deps.Categories.Get(ctx, request.CategoryId, boolParam(request.Params.IncludeTombstoned))
	if err != nil {
		return nil, err
	}

	return openapi.GetCategory200JSONResponse(categoryAPIResponse(category)), nil
}

func (s *strictServer) UpdateCategory(ctx context.Context, request openapi.UpdateCategoryRequestObject) (openapi.UpdateCategoryResponseObject, error) {
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

	return openapi.ListMembers200JSONResponse{
		Members:    memberAPIResponses(memberList.Items),
		TotalCount: memberList.TotalCount,
	}, nil
}

func (s *strictServer) CreateMember(ctx context.Context, request openapi.CreateMemberRequestObject) (openapi.CreateMemberResponseObject, error) {
	member, err := s.deps.Members.Create(ctx, members.CreateInput{Name: request.Body.Name})
	if err != nil {
		return nil, err
	}

	return openapi.CreateMember201JSONResponse(memberAPIResponse(member)), nil
}

func (s *strictServer) DeleteMember(ctx context.Context, request openapi.DeleteMemberRequestObject) (openapi.DeleteMemberResponseObject, error) {
	if err := s.deps.Members.Delete(ctx, request.MemberId); err != nil {
		return nil, err
	}

	return openapi.DeleteMember204Response{}, nil
}

func (s *strictServer) GetMember(ctx context.Context, request openapi.GetMemberRequestObject) (openapi.GetMemberResponseObject, error) {
	member, err := s.deps.Members.Get(ctx, request.MemberId, boolParam(request.Params.IncludeTombstoned))
	if err != nil {
		return nil, err
	}

	return openapi.GetMember200JSONResponse(memberAPIResponse(member)), nil
}

func (s *strictServer) UpdateMember(ctx context.Context, request openapi.UpdateMemberRequestObject) (openapi.UpdateMemberResponseObject, error) {
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

	return openapi.ListTags200JSONResponse{
		Tags:       tagAPIResponses(tagList.Items),
		TotalCount: tagList.TotalCount,
	}, nil
}

func (s *strictServer) ListTagGroups(ctx context.Context, request openapi.ListTagGroupsRequestObject) (openapi.ListTagGroupsResponseObject, error) {
	groups, err := s.deps.Tags.GroupStates(ctx, boolParam(request.Params.IncludeHidden))
	if err != nil {
		return nil, err
	}

	return openapi.ListTagGroups200JSONResponse{
		Groups: groupStateAPIResponses(groups),
	}, nil
}

func (s *strictServer) CreateTag(ctx context.Context, request openapi.CreateTagRequestObject) (openapi.CreateTagResponseObject, error) {
	tag, err := s.deps.Tags.Create(ctx, tags.CreateInput{
		FQN:      request.Body.Fqn,
		IsHidden: request.Body.IsHidden != nil && *request.Body.IsHidden,
	})
	if err != nil {
		return nil, err
	}

	return openapi.CreateTag201JSONResponse(tagAPIResponse(tag)), nil
}

func (s *strictServer) RestructureTags(ctx context.Context, request openapi.RestructureTagsRequestObject) (openapi.RestructureTagsResponseObject, error) {
	movedCount, err := s.deps.Tags.Restructure(ctx, request.Body.FromFqn, request.Body.ToFqn)
	if err != nil {
		return nil, err
	}

	return openapi.RestructureTags200JSONResponse{MovedCount: movedCount}, nil
}

func (s *strictServer) SetTagHiddenByPath(ctx context.Context, request openapi.SetTagHiddenByPathRequestObject) (openapi.SetTagHiddenByPathResponseObject, error) {
	updatedCount, err := s.deps.Tags.SetHiddenByPath(ctx, request.Body.PathFqn, request.Body.IsHidden)
	if err != nil {
		return nil, err
	}

	return openapi.SetTagHiddenByPath200JSONResponse{UpdatedCount: updatedCount}, nil
}

func (s *strictServer) DeleteTag(ctx context.Context, request openapi.DeleteTagRequestObject) (openapi.DeleteTagResponseObject, error) {
	if err := s.deps.Tags.Delete(ctx, request.TagId); err != nil {
		return nil, err
	}

	return openapi.DeleteTag204Response{}, nil
}

func (s *strictServer) GetTag(ctx context.Context, request openapi.GetTagRequestObject) (openapi.GetTagResponseObject, error) {
	tag, err := s.deps.Tags.Get(ctx, request.TagId, boolParam(request.Params.IncludeTombstoned))
	if err != nil {
		return nil, err
	}

	return openapi.GetTag200JSONResponse(tagAPIResponse(tag)), nil
}

func (s *strictServer) UpdateTag(ctx context.Context, request openapi.UpdateTagRequestObject) (openapi.UpdateTagResponseObject, error) {
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

func accountAPIResponse(account accounts.Account) openapi.Account {
	return openapi.Account{
		AccountId:      account.ID,
		Fqn:            account.FQN,
		AccountType:    openapi.AccountType(account.AccountType),
		IsHidden:       account.IsHidden,
		IsFeatured:     account.IsFeatured,
		Deletable:      account.Deletable,
		Currency:       account.Currency,
		ExternalId:     account.ExternalID,
		ExternalSystem: account.ExternalSystem,
		ParentFqn:      account.ParentFQN,
		Name:           account.Name,
		Level:          account.Level,
		CreatedAt:      account.CreatedAt.UTC(),
		UpdatedAt:      account.UpdatedAt.UTC(),
		TombstonedAt:   nullableTimestampTime(account.TombstonedAt),
	}
}

func optionalNullableString(value nullable.Nullable[string]) accounts.OptionalStringUpdate {
	if !value.IsSpecified() {
		return accounts.OptionalStringUpdate{}
	}
	if value.IsNull() {
		return accounts.OptionalStringUpdate{Specified: true}
	}
	stringValue := value.MustGet()
	return accounts.OptionalStringUpdate{Specified: true, Value: &stringValue}
}

func accountAPIResponses(accounts []accounts.Account) []openapi.Account {
	responses := make([]openapi.Account, 0, len(accounts))
	for _, account := range accounts {
		responses = append(responses, accountAPIResponse(account))
	}

	return responses
}

func groupStateAPIResponse(group services.FQNGroupState) openapi.GroupState {
	return openapi.GroupState{
		Fqn:       group.FQN,
		ParentFqn: group.ParentFQN,
		Level:     group.Level,
		IsHidden:  group.IsHidden,
	}
}

func groupStateAPIResponses(groups []services.FQNGroupState) []openapi.GroupState {
	responses := make([]openapi.GroupState, 0, len(groups))
	for _, group := range groups {
		responses = append(responses, groupStateAPIResponse(group))
	}

	return responses
}

func accountBalanceAPIResponse(balance accounts.AccountBalance, currentLimits map[int64]values.Decimal) openapi.AccountBalance {
	var creditLimit *string
	if limit, ok := currentLimits[balance.AccountID]; ok {
		value := limit.String()
		creditLimit = &value
	}

	return openapi.AccountBalance{
		AccountId:         balance.AccountID,
		Currency:          balance.Currency,
		CreditLimit:       creditLimit,
		CurrentBalance:    balance.CurrentBalance.String(),
		CurrentBalanceUsd: balance.CurrentBalanceUSD.String(),
		PostedBalance:     balance.PostedBalance.String(),
		UnconvertedCount:  balance.UnconvertedCount,
	}
}

func accountBalanceAPIResponses(balances []accounts.AccountBalance, currentLimits map[int64]values.Decimal) []openapi.AccountBalance {
	responses := make([]openapi.AccountBalance, 0, len(balances))
	for _, balance := range balances {
		responses = append(responses, accountBalanceAPIResponse(balance, currentLimits))
	}

	return responses
}

func accountIDsFromBalances(balances []accounts.AccountBalance) []int64 {
	ids := make([]int64, 0, len(balances))
	for _, balance := range balances {
		ids = append(ids, balance.AccountID)
	}

	return ids
}

func categoryAPIResponse(category categories.Category) openapi.Category {
	return openapi.Category{
		CategoryId:     category.ID,
		Fqn:            category.FQN,
		EconomicIntent: openapi.CategoryEconomicIntent(category.EconomicIntent),
		IsHidden:       category.IsHidden,
		ParentFqn:      category.ParentFQN,
		Name:           category.Name,
		Level:          category.Level,
		CreatedAt:      category.CreatedAt.UTC(),
		UpdatedAt:      category.UpdatedAt.UTC(),
		TombstonedAt:   nullableTimestampTime(category.TombstonedAt),
	}
}

func categoryAPIResponses(categories []categories.Category) []openapi.Category {
	responses := make([]openapi.Category, 0, len(categories))
	for _, category := range categories {
		responses = append(responses, categoryAPIResponse(category))
	}

	return responses
}

func categoryEconomicIntentsFromAPI(values *[]openapi.CategoryEconomicIntent) []categories.CategoryEconomicIntent {
	if values == nil {
		return nil
	}

	intents := make([]categories.CategoryEconomicIntent, 0, len(*values))
	for _, value := range *values {
		intents = append(intents, categories.CategoryEconomicIntent(value))
	}

	return intents
}

func memberAPIResponse(member members.Member) openapi.Member {
	return openapi.Member{
		MemberId:     member.ID,
		Name:         member.Name,
		CreatedAt:    member.CreatedAt.UTC(),
		UpdatedAt:    member.UpdatedAt.UTC(),
		TombstonedAt: nullableTimestampTime(member.TombstonedAt),
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
		CreatedAt:    tag.CreatedAt.UTC(),
		UpdatedAt:    tag.UpdatedAt.UTC(),
		TombstonedAt: nullableTimestampTime(tag.TombstonedAt),
	}
}

func tagAPIResponses(tags []tags.Tag) []openapi.Tag {
	responses := make([]openapi.Tag, 0, len(tags))
	for _, tag := range tags {
		responses = append(responses, tagAPIResponse(tag))
	}

	return responses
}

func nullableTimestampTime(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}

	timestamp := value.UTC()

	return &timestamp
}
