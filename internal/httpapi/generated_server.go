package httpapi

import (
	"net/http"

	"mina.local/mina/internal/httpapi/openapi"
)

var _ openapi.ServerInterface = (*generatedServer)(nil)

type generatedServer struct {
	handler http.Handler
}

func newGeneratedServer(handler http.Handler) *generatedServer {
	return &generatedServer{handler: handler}
}

func (s *generatedServer) serve(w http.ResponseWriter, r *http.Request) {
	s.handler.ServeHTTP(w, r)
}

func (s *generatedServer) ListAccounts(w http.ResponseWriter, r *http.Request, params openapi.ListAccountsParams) {
	s.serve(w, r)
}

func (s *generatedServer) CreateAccount(w http.ResponseWriter, r *http.Request) {
	s.serve(w, r)
}

func (s *generatedServer) DeleteAccount(w http.ResponseWriter, r *http.Request, accountID int64) {
	s.serve(w, r)
}

func (s *generatedServer) GetAccount(w http.ResponseWriter, r *http.Request, accountID int64, params openapi.GetAccountParams) {
	s.serve(w, r)
}

func (s *generatedServer) UpdateAccount(w http.ResponseWriter, r *http.Request, accountID int64) {
	s.serve(w, r)
}

func (s *generatedServer) ListCreditLimitHistory(w http.ResponseWriter, r *http.Request, accountID int64, params openapi.ListCreditLimitHistoryParams) {
	s.serve(w, r)
}

func (s *generatedServer) CreateCreditLimitHistory(w http.ResponseWriter, r *http.Request, accountID int64) {
	s.serve(w, r)
}

func (s *generatedServer) SearchAccountJournalRecords(w http.ResponseWriter, r *http.Request, accountID int64, params openapi.SearchAccountJournalRecordsParams) {
	s.serve(w, r)
}

func (s *generatedServer) ListCategories(w http.ResponseWriter, r *http.Request, params openapi.ListCategoriesParams) {
	s.serve(w, r)
}

func (s *generatedServer) CreateCategory(w http.ResponseWriter, r *http.Request) {
	s.serve(w, r)
}

func (s *generatedServer) DeleteCategory(w http.ResponseWriter, r *http.Request, categoryID int64) {
	s.serve(w, r)
}

func (s *generatedServer) GetCategory(w http.ResponseWriter, r *http.Request, categoryID int64, params openapi.GetCategoryParams) {
	s.serve(w, r)
}

func (s *generatedServer) UpdateCategory(w http.ResponseWriter, r *http.Request, categoryID int64) {
	s.serve(w, r)
}

func (s *generatedServer) DeleteCreditLimitHistory(w http.ResponseWriter, r *http.Request, creditLimitHistoryID int64) {
	s.serve(w, r)
}

func (s *generatedServer) GetCreditLimitHistory(w http.ResponseWriter, r *http.Request, creditLimitHistoryID int64, params openapi.GetCreditLimitHistoryParams) {
	s.serve(w, r)
}

func (s *generatedServer) ListExchangeRates(w http.ResponseWriter, r *http.Request, params openapi.ListExchangeRatesParams) {
	s.serve(w, r)
}

func (s *generatedServer) CreateExchangeRate(w http.ResponseWriter, r *http.Request) {
	s.serve(w, r)
}

func (s *generatedServer) DeleteExchangeRate(w http.ResponseWriter, r *http.Request, exchangeRateID int64) {
	s.serve(w, r)
}

func (s *generatedServer) GetExchangeRate(w http.ResponseWriter, r *http.Request, exchangeRateID int64, params openapi.GetExchangeRateParams) {
	s.serve(w, r)
}

func (s *generatedServer) UpdateExchangeRate(w http.ResponseWriter, r *http.Request, exchangeRateID int64) {
	s.serve(w, r)
}

func (s *generatedServer) GetHealth(w http.ResponseWriter, r *http.Request) {
	s.serve(w, r)
}

func (s *generatedServer) ListMembers(w http.ResponseWriter, r *http.Request, params openapi.ListMembersParams) {
	s.serve(w, r)
}

func (s *generatedServer) CreateMember(w http.ResponseWriter, r *http.Request) {
	s.serve(w, r)
}

func (s *generatedServer) DeleteMember(w http.ResponseWriter, r *http.Request, memberID int64) {
	s.serve(w, r)
}

func (s *generatedServer) GetMember(w http.ResponseWriter, r *http.Request, memberID int64, params openapi.GetMemberParams) {
	s.serve(w, r)
}

func (s *generatedServer) UpdateMember(w http.ResponseWriter, r *http.Request, memberID int64) {
	s.serve(w, r)
}

func (s *generatedServer) SearchJournalRecords(w http.ResponseWriter, r *http.Request, params openapi.SearchJournalRecordsParams) {
	s.serve(w, r)
}

func (s *generatedServer) BulkReassignJournalRecordAccount(w http.ResponseWriter, r *http.Request) {
	s.serve(w, r)
}

func (s *generatedServer) BulkCategorizeJournalRecords(w http.ResponseWriter, r *http.Request) {
	s.serve(w, r)
}

func (s *generatedServer) BulkUpdateJournalRecordStatuses(w http.ResponseWriter, r *http.Request) {
	s.serve(w, r)
}

func (s *generatedServer) BulkUpdateJournalRecordTags(w http.ResponseWriter, r *http.Request) {
	s.serve(w, r)
}

func (s *generatedServer) ListTags(w http.ResponseWriter, r *http.Request, params openapi.ListTagsParams) {
	s.serve(w, r)
}

func (s *generatedServer) CreateTag(w http.ResponseWriter, r *http.Request) {
	s.serve(w, r)
}

func (s *generatedServer) DeleteTag(w http.ResponseWriter, r *http.Request, tagID int64) {
	s.serve(w, r)
}

func (s *generatedServer) GetTag(w http.ResponseWriter, r *http.Request, tagID int64, params openapi.GetTagParams) {
	s.serve(w, r)
}

func (s *generatedServer) UpdateTag(w http.ResponseWriter, r *http.Request, tagID int64) {
	s.serve(w, r)
}

func (s *generatedServer) ListTransactions(w http.ResponseWriter, r *http.Request) {
	s.serve(w, r)
}

func (s *generatedServer) CreateTransaction(w http.ResponseWriter, r *http.Request) {
	s.serve(w, r)
}

func (s *generatedServer) DeleteTransaction(w http.ResponseWriter, r *http.Request, transactionID int64) {
	s.serve(w, r)
}

func (s *generatedServer) GetTransaction(w http.ResponseWriter, r *http.Request, transactionID int64) {
	s.serve(w, r)
}

func (s *generatedServer) ReplaceTransaction(w http.ResponseWriter, r *http.Request, transactionID int64) {
	s.serve(w, r)
}
