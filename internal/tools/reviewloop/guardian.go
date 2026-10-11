package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type codexSession struct {
	threadID     string
	outputSchema string
}

type reviewGuardian struct {
	session codexSession
}

type guardianState struct {
	Phase            string            `json:"phase"`
	Iteration        int               `json:"iteration"`
	CompletedReviews int               `json:"completed_reviews"`
	ReviewRange      string            `json:"review_range"`
	Reviewers        []string          `json:"reviewers"`
	LastProvider     string            `json:"last_provider"`
	FailedProviders  map[string]string `json:"failed_providers"`
	PendingFindings  int               `json:"pending_findings"`
	RawReviews       string            `json:"latest_raw_reviews"`
	FinalReview      string            `json:"latest_validated_review"`
	FixSummary       string            `json:"latest_fix_summary"`
}

type guardianDecision struct {
	Action   string `json:"action"`
	Provider string `json:"provider"`
	Outcome  string `json:"outcome"`
	Reason   string `json:"reason"`
}

func newReviewGuardian(cfg config) (*reviewGuardian, error) {
	path := filepath.Join(cfg.scratchDir, "guardian-schema.json")
	const schema = `{
		"type":"object", "additionalProperties":false,
		"properties":{
			"action":{"type":"string","enum":["review","fix","continue","stop"]},
			"provider":{"type":"string","enum":["codex","claude","none"]},
			"outcome":{"type":"string","enum":["continue","clean","stalled","unavailable"]},
			"reason":{"type":"string"}
		},
		"required":["action","provider","outcome","reason"]
	}`
	if err := os.WriteFile(path, []byte(schema), 0o600); err != nil {
		return nil, fmt.Errorf("write guardian schema: %w", err)
	}
	return &reviewGuardian{session: codexSession{outputSchema: path}}, nil
}

func (guardian *reviewGuardian) decide(cfg config, state guardianState) (guardianDecision, error) {
	observations, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return guardianDecision{}, err
	}
	prompt, err := interpolate(cfg.templates.guardian, map[string]string{
		"REVIEW_BASIS": cfg.reviewBasis,
		"OBSERVATIONS": string(observations),
	})
	if err != nil {
		return guardianDecision{}, fmt.Errorf("build guardian prompt: %w", err)
	}
	message, err := runCodexSession(cfg, "guardian", prompt, cfg.codexGuardian, &guardian.session)
	if err != nil {
		return guardianDecision{}, fmt.Errorf("guardian unavailable or failed; review cannot proceed: %w; history: %s", err, cfg.previousReviewFile)
	}
	var decision guardianDecision
	if err := json.Unmarshal([]byte(message), &decision); err != nil {
		return guardianDecision{}, fmt.Errorf("invalid guardian JSON: %w", err)
	}
	if err := decision.validate(state); err != nil {
		return guardianDecision{}, fmt.Errorf("invalid guardian decision: %w; output: %s", err, message)
	}
	writeProgressLine("guardian session=%s iteration=%d phase=%s: %s / %s / %s: %s", guardian.session.threadID, state.Iteration, state.Phase, decision.Action, decision.Provider, decision.Outcome, decision.Reason)
	if err := appendProgressHistory(cfg.previousReviewFile, fmt.Sprintf("Guardian iteration %d (%s)", state.Iteration, state.Phase), message); err != nil {
		return guardianDecision{}, err
	}
	return decision, nil
}

func (decision guardianDecision) validate(state guardianState) error {
	if strings.TrimSpace(decision.Reason) == "" {
		return errors.New("reason is required")
	}
	switch decision.Action {
	case "review":
		if state.Phase != "before_review" {
			return errors.New("review provider selection requires before_review")
		}
		if decision.Provider != "codex" && decision.Provider != "claude" {
			return errors.New("review requires codex or claude")
		}
		if _, failed := state.FailedProviders[decision.Provider]; failed {
			return errors.New("cannot select an unavailable reviewer provider")
		}
	case "fix":
		if state.Phase != "after_review" || state.PendingFindings == 0 || decision.Provider != "none" {
			return errors.New("fix requires validated findings after a review and provider none")
		}
	case "continue":
		if state.Phase != "after_review" || state.PendingFindings != 0 || decision.Provider != "none" {
			return errors.New("continue requires a completed review without pending findings and provider none")
		}
	case "stop":
		if decision.Provider != "none" {
			return errors.New("stop requires provider none")
		}
		switch decision.Outcome {
		case "clean":
			if state.Phase != "after_review" || state.CompletedReviews == 0 || state.PendingFindings != 0 {
				return errors.New("clean requires a completed review with no pending findings")
			}
		case "unavailable":
			if len(state.FailedProviders) != 2 {
				return errors.New("unavailable requires both reviewer providers to have failed")
			}
		case "stalled":
		default:
			return errors.New("stop requires clean, stalled, or unavailable")
		}
		return nil
	default:
		return errors.New("action must be review, fix, continue, or stop")
	}
	if decision.Outcome != "continue" {
		return errors.New("review, fix, and continue require outcome continue")
	}
	return nil
}

func guardianStop(cfg config, state guardianState, decision guardianDecision) (int, error) {
	fmt.Printf("review loop stopped by guardian (%s) after %d completed review(s): %s; history: %s\n", decision.Outcome, state.CompletedReviews, decision.Reason, cfg.previousReviewFile)
	switch decision.Outcome {
	case "clean":
		return 0, nil
	case "unavailable":
		return 2, nil
	default:
		return 1, nil
	}
}
