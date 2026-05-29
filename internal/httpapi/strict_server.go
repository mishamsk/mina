package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"mina.local/mina/internal/httpapi/models"
	"mina.local/mina/internal/httpapi/openapi"
)

var _ openapi.StrictServerInterface = (*strictServer)(nil)

var errStrictHandlerNotImplemented = errors.New("strict handler not implemented")

type strictServer struct {
	deps Dependencies
}

func newStrictServer(deps Dependencies) *strictServer {
	return &strictServer{deps: deps}
}

func generatedChiServerOptions() openapi.ChiServerOptions {
	return openapi.ChiServerOptions{
		ErrorHandlerFunc: generatedRequestErrorHandler,
	}
}

func strictHTTPServerOptions() openapi.StrictHTTPServerOptions {
	return openapi.StrictHTTPServerOptions{
		RequestErrorHandlerFunc:  generatedRequestErrorHandler,
		ResponseErrorHandlerFunc: generatedResponseErrorHandler,
	}
}

func generatedRequestErrorHandler(w http.ResponseWriter, _ *http.Request, err error) {
	WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, generatedRequestErrorMessage(err))
}

func generatedResponseErrorHandler(w http.ResponseWriter, _ *http.Request, err error) {
	WriteControllerError(w, err)
}

func generatedRequestErrorMessage(err error) string {
	if err != nil && strings.Contains(err.Error(), "JSON body") {
		return "invalid JSON request body"
	}

	return "invalid request"
}

func (s *strictServer) ListAccounts(ctx context.Context, request openapi.ListAccountsRequestObject) (openapi.ListAccountsResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) CreateAccount(ctx context.Context, request openapi.CreateAccountRequestObject) (openapi.CreateAccountResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) DeleteAccount(ctx context.Context, request openapi.DeleteAccountRequestObject) (openapi.DeleteAccountResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) GetAccount(ctx context.Context, request openapi.GetAccountRequestObject) (openapi.GetAccountResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) UpdateAccount(ctx context.Context, request openapi.UpdateAccountRequestObject) (openapi.UpdateAccountResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) ListCreditLimitHistory(ctx context.Context, request openapi.ListCreditLimitHistoryRequestObject) (openapi.ListCreditLimitHistoryResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) CreateCreditLimitHistory(ctx context.Context, request openapi.CreateCreditLimitHistoryRequestObject) (openapi.CreateCreditLimitHistoryResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) SearchAccountJournalRecords(ctx context.Context, request openapi.SearchAccountJournalRecordsRequestObject) (openapi.SearchAccountJournalRecordsResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) ListCategories(ctx context.Context, request openapi.ListCategoriesRequestObject) (openapi.ListCategoriesResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) CreateCategory(ctx context.Context, request openapi.CreateCategoryRequestObject) (openapi.CreateCategoryResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) DeleteCategory(ctx context.Context, request openapi.DeleteCategoryRequestObject) (openapi.DeleteCategoryResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) GetCategory(ctx context.Context, request openapi.GetCategoryRequestObject) (openapi.GetCategoryResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) UpdateCategory(ctx context.Context, request openapi.UpdateCategoryRequestObject) (openapi.UpdateCategoryResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) DeleteCreditLimitHistory(ctx context.Context, request openapi.DeleteCreditLimitHistoryRequestObject) (openapi.DeleteCreditLimitHistoryResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) GetCreditLimitHistory(ctx context.Context, request openapi.GetCreditLimitHistoryRequestObject) (openapi.GetCreditLimitHistoryResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) ListExchangeRates(ctx context.Context, request openapi.ListExchangeRatesRequestObject) (openapi.ListExchangeRatesResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) CreateExchangeRate(ctx context.Context, request openapi.CreateExchangeRateRequestObject) (openapi.CreateExchangeRateResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) DeleteExchangeRate(ctx context.Context, request openapi.DeleteExchangeRateRequestObject) (openapi.DeleteExchangeRateResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) GetExchangeRate(ctx context.Context, request openapi.GetExchangeRateRequestObject) (openapi.GetExchangeRateResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) UpdateExchangeRate(ctx context.Context, request openapi.UpdateExchangeRateRequestObject) (openapi.UpdateExchangeRateResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) GetHealth(ctx context.Context, request openapi.GetHealthRequestObject) (openapi.GetHealthResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) ListMembers(ctx context.Context, request openapi.ListMembersRequestObject) (openapi.ListMembersResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) CreateMember(ctx context.Context, request openapi.CreateMemberRequestObject) (openapi.CreateMemberResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) DeleteMember(ctx context.Context, request openapi.DeleteMemberRequestObject) (openapi.DeleteMemberResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) GetMember(ctx context.Context, request openapi.GetMemberRequestObject) (openapi.GetMemberResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) UpdateMember(ctx context.Context, request openapi.UpdateMemberRequestObject) (openapi.UpdateMemberResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) SearchJournalRecords(ctx context.Context, request openapi.SearchJournalRecordsRequestObject) (openapi.SearchJournalRecordsResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) BulkReassignJournalRecordAccount(ctx context.Context, request openapi.BulkReassignJournalRecordAccountRequestObject) (openapi.BulkReassignJournalRecordAccountResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) BulkCategorizeJournalRecords(ctx context.Context, request openapi.BulkCategorizeJournalRecordsRequestObject) (openapi.BulkCategorizeJournalRecordsResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) BulkUpdateJournalRecordStatuses(ctx context.Context, request openapi.BulkUpdateJournalRecordStatusesRequestObject) (openapi.BulkUpdateJournalRecordStatusesResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) BulkUpdateJournalRecordTags(ctx context.Context, request openapi.BulkUpdateJournalRecordTagsRequestObject) (openapi.BulkUpdateJournalRecordTagsResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) ListTags(ctx context.Context, request openapi.ListTagsRequestObject) (openapi.ListTagsResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) CreateTag(ctx context.Context, request openapi.CreateTagRequestObject) (openapi.CreateTagResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) DeleteTag(ctx context.Context, request openapi.DeleteTagRequestObject) (openapi.DeleteTagResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) GetTag(ctx context.Context, request openapi.GetTagRequestObject) (openapi.GetTagResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) UpdateTag(ctx context.Context, request openapi.UpdateTagRequestObject) (openapi.UpdateTagResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) ListTransactions(ctx context.Context, request openapi.ListTransactionsRequestObject) (openapi.ListTransactionsResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) CreateTransaction(ctx context.Context, request openapi.CreateTransactionRequestObject) (openapi.CreateTransactionResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) DeleteTransaction(ctx context.Context, request openapi.DeleteTransactionRequestObject) (openapi.DeleteTransactionResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) GetTransaction(ctx context.Context, request openapi.GetTransactionRequestObject) (openapi.GetTransactionResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}

func (s *strictServer) ReplaceTransaction(ctx context.Context, request openapi.ReplaceTransactionRequestObject) (openapi.ReplaceTransactionResponseObject, error) {
	return nil, errStrictHandlerNotImplemented
}
