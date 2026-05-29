package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"mina.local/mina/internal/models"
)

func parseBoolQuery(w http.ResponseWriter, r *http.Request, name string) (bool, bool) {
	values, ok := r.URL.Query()[name]
	if !ok {
		return false, true
	}
	if len(values) != 1 || values[0] == "" {
		WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, name+" must be a boolean")
		return false, false
	}

	parsed, err := strconv.ParseBool(values[0])
	if err != nil {
		WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, name+" must be a boolean")
		return false, false
	}

	return parsed, true
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		WriteAPIError(w, http.StatusInternalServerError, models.ErrorCodeInternal, "failed to write response")
	}
}

func decodeStrictJSON(r *http.Request, dst any) error {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return fmt.Errorf("read request body: %w", err)
	}
	if len(bytes.TrimSpace(body)) == 0 {
		return errors.New("empty request body")
	}

	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		return fmt.Errorf("decode request body: %w", err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return errors.New("multiple JSON values")
	}

	return nil
}
