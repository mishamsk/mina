package transactions

import (
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/mishamsk/mina/internal/services"
)

type filterTokenKind int

const (
	filterTokenTerm filterTokenKind = iota
	filterTokenAnd
	filterTokenOr
	filterTokenNot
	filterTokenLParen
	filterTokenRParen
	filterTokenEnd
)

type filterToken struct {
	kind   filterTokenKind
	text   string
	offset int
}

func filterErrorf(offset int, format string, args ...any) error {
	return services.InvalidRequest(fmt.Sprintf("filter %s at byte %d", fmt.Sprintf(format, args...), offset))
}

func countedFilterLength(text string, tokens []filterToken) int {
	count := utf8.RuneCountInString(text)
	for _, token := range tokens {
		if token.kind != filterTokenTerm {
			continue
		}
		field, _, rawValue, _, err := splitFilterTerm(token.text)
		if err != nil || (FilterField(field) != FilterFieldAccount && FilterField(field) != FilterFieldCategory && FilterField(field) != FilterFieldTag && FilterField(field) != FilterFieldMember) || !filterValueIsQuoted(rawValue) {
			continue
		}
		count -= utf8.RuneCountInString(rawValue[1 : len(rawValue)-1])
	}
	return count
}

func lexFilterTokens(text string) ([]filterToken, error) {
	tokens := []filterToken{}
	position := 0
	for position < len(text) {
		switch character := text[position]; character {
		case ' ', '\t', '\n', '\r':
			position++
			continue
		case '(':
			tokens = append(tokens, filterToken{kind: filterTokenLParen, text: "(", offset: position})
			position++
			continue
		case ')':
			tokens = append(tokens, filterToken{kind: filterTokenRParen, text: ")", offset: position})
			position++
			continue
		case '-':
			return nil, filterErrorf(position, "does not support dash negation; use not")
		}

		token, next, err := scanFilterWord(text, position)
		if err != nil {
			return nil, err
		}
		if !strings.ContainsRune(token.text, '"') {
			token.kind = filterKeyword(strings.TrimSpace(token.text))
		}
		tokens = append(tokens, token)
		position = next
	}
	return tokens, nil
}

func scanFilterWord(text string, start int) (filterToken, int, error) {
	token := filterToken{kind: filterTokenTerm, offset: start}
	position := start
	for position < len(text) && !filterWhitespace(text[position]) && text[position] != '(' && text[position] != ')' && !strings.ContainsRune(":=><", rune(text[position])) {
		position++
	}
	fieldEnd := position
	for position < len(text) && filterWhitespace(text[position]) {
		position++
	}
	if position >= len(text) || !strings.ContainsRune(":=><", rune(text[position])) {
		token.text = text[start:fieldEnd]
		return token, fieldEnd, nil
	}
	position++
	if position < len(text) && (text[position-1] == '>' || text[position-1] == '<') && text[position] == '=' {
		position++
	}
	for position < len(text) && filterWhitespace(text[position]) {
		position++
	}
	if position < len(text) && text[position] == '"' {
		end, err := scanFilterQuoted(text, position)
		if err != nil {
			return filterToken{}, 0, filterErrorf(position, "%s", err.Error())
		}
		position = end
		for position < len(text) && !filterWhitespace(text[position]) && text[position] != '(' && text[position] != ')' {
			if text[position] == '"' {
				end, err = scanFilterQuoted(text, position)
				if err != nil {
					return filterToken{}, 0, filterErrorf(position, "%s", err.Error())
				}
				position = end
				continue
			}
			position++
		}
	} else {
		for position < len(text) && !filterWhitespace(text[position]) && text[position] != '(' && text[position] != ')' {
			position++
		}
	}
	token.text = text[start:position]
	return token, position, nil
}

func filterWhitespace(character byte) bool {
	return character == ' ' || character == '\t' || character == '\n' || character == '\r'
}

func scanFilterQuoted(text string, start int) (int, error) {
	position := start + 1
	for position < len(text) {
		switch text[position] {
		case '\\':
			if position+1 >= len(text) {
				return 0, fmt.Errorf("unterminated escape")
			}
			position += 2
		case '"':
			return position + 1, nil
		default:
			position++
		}
	}
	return 0, fmt.Errorf("unterminated quoted value")
}

func filterKeyword(text string) filterTokenKind {
	switch strings.ToLower(text) {
	case "and":
		return filterTokenAnd
	case "or":
		return filterTokenOr
	case "not":
		return filterTokenNot
	default:
		return filterTokenTerm
	}
}
