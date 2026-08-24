package transactions

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/values"
)

func parseFilterExpression(text string, now time.Time) (FilterExpression, error) {
	tokens, err := lexFilterTokens(text)
	if err != nil {
		return nil, err
	}
	if countedFilterLength(text, tokens) > maxFilterLength {
		return nil, services.InvalidRequest(
			"filter syntax outside quoted reference values must be at most " + strconv.Itoa(maxFilterLength) + " characters")
	}
	if len(tokens) == 0 {
		return nil, filterErrorf(0, "must contain at least one term")
	}
	parser := &filterParser{tokens: tokens, now: now}
	expression, err := parser.parseOr(0)
	if err != nil {
		return nil, err
	}
	if token := parser.peek(); token.kind != filterTokenEnd {
		return nil, filterErrorf(token.offset, "unexpected %s", filterTokenDescription(token))
	}
	return expression, nil
}

type filterParser struct {
	tokens []filterToken
	pos    int
	terms  int
	now    time.Time
}

func (p *filterParser) peek() filterToken {
	if p.pos < len(p.tokens) {
		return p.tokens[p.pos]
	}
	return filterToken{kind: filterTokenEnd, offset: p.endOffset()}
}

func (p *filterParser) endOffset() int {
	if len(p.tokens) == 0 {
		return 0
	}
	last := p.tokens[len(p.tokens)-1]
	return last.offset + len(last.text)
}

func (p *filterParser) next() filterToken {
	token := p.peek()
	p.pos++
	return token
}

func filterTokenDescription(token filterToken) string {
	switch token.kind {
	case filterTokenAnd:
		return "and"
	case filterTokenOr:
		return "or"
	case filterTokenRParen:
		return ")"
	case filterTokenEnd:
		return "end of expression"
	default:
		return strconv.Quote(token.text)
	}
}

func startsFilterUnary(token filterToken) bool {
	switch token.kind {
	case filterTokenTerm, filterTokenNot, filterTokenLParen:
		return true
	default:
		return false
	}
}

func (p *filterParser) parseOr(depth int) (FilterExpression, error) {
	terms := []FilterExpression{}
	for {
		term, err := p.parseAnd(depth)
		if err != nil {
			return nil, err
		}
		terms = append(terms, term)
		if p.peek().kind != filterTokenOr {
			break
		}
		p.next()
	}
	if len(terms) == 1 {
		return terms[0], nil
	}
	return &FilterOr{Terms: terms}, nil
}

func (p *filterParser) parseAnd(depth int) (FilterExpression, error) {
	terms := []FilterExpression{}
	for {
		term, err := p.parseUnary(depth)
		if err != nil {
			return nil, err
		}
		terms = append(terms, term)
		token := p.peek()
		if token.kind == filterTokenAnd {
			p.next()
			continue
		}
		if startsFilterUnary(token) {
			return nil, filterErrorf(token.offset, "expected and or or before %s", filterTokenDescription(token))
		}
		break
	}
	if len(terms) == 1 {
		return terms[0], nil
	}
	return &FilterAnd{Terms: terms}, nil
}

func (p *filterParser) parseUnary(depth int) (FilterExpression, error) {
	token := p.next()
	switch token.kind {
	case filterTokenNot:
		inner, err := p.parseUnary(depth)
		if err != nil {
			return nil, err
		}
		if doubleNegation, ok := inner.(*FilterNot); ok {
			return doubleNegation.Term, nil
		}
		return &FilterNot{Term: inner}, nil
	case filterTokenLParen:
		if depth >= maxFilterDepth {
			return nil, filterErrorf(token.offset, "must nest at most %d levels deep", maxFilterDepth)
		}
		inner, err := p.parseOr(depth + 1)
		if err != nil {
			return nil, err
		}
		if closing := p.next(); closing.kind != filterTokenRParen {
			return nil, filterErrorf(token.offset, "has an unclosed group starting here")
		}
		return inner, nil
	case filterTokenTerm:
		p.terms++
		if p.terms > maxFilterTerms {
			return nil, filterErrorf(token.offset, "must contain at most %d terms", maxFilterTerms)
		}
		return p.parseTermLeaf(token)
	case filterTokenEnd:
		return nil, filterErrorf(p.endOffset(), "expected a term")
	default:
		return nil, filterErrorf(token.offset, "unexpected %s", filterTokenDescription(token))
	}
}

func (p *filterParser) parseTermLeaf(token filterToken) (FilterExpression, error) {
	fieldText, operator, rawValue, valueOffsetInToken, err := splitFilterTerm(token.text)
	if err != nil {
		return nil, filterErrorf(token.offset, "%s", err.Error())
	}
	field := FilterField(fieldText)
	if strings.ContainsRune(rawValue, '"') && !filterValueIsQuoted(rawValue) && !filterValueStartsEntityIDLiteral(rawValue) {
		return nil, filterErrorf(token.offset, "quotes must delimit one complete value")
	}
	if strings.Contains(rawValue, ":") && !filterValueIsQuoted(rawValue) && !filterValueStartsEntityIDLiteral(rawValue) {
		return nil, filterErrorf(token.offset, "values containing : must be quoted")
	}
	switch {
	case membershipFilterFields[field]:
		if operator != ":" {
			return nil, filterErrorf(token.offset, "field %s only supports : membership terms", fieldText)
		}
		valueOffset := token.offset + valueOffsetInToken
		if filterValueStartsEntityIDLiteral(rawValue) {
			if field != FilterFieldAccount && field != FilterFieldCategory && field != FilterFieldTag && field != FilterFieldMember {
				return nil, filterErrorf(valueOffset, "field %s does not accept entity-ID literals", fieldText)
			}
			entityID, err := parseFilterEntityIDLiteral(rawValue)
			if err != nil {
				return nil, filterErrorf(valueOffset, "entity-ID literal must use # followed by a positive base-10 integer")
			}
			if field == FilterFieldMember {
				return &FilterMemberTerm{MemberID: entityID}, nil
			}
			return &FilterEntityTerm{Field: field, EntityID: entityID}, nil
		}
		if field == FilterFieldAccount || field == FilterFieldCategory || field == FilterFieldTag {
			return parseFilterEntityTermLeaf(token.offset, valueOffset, field, rawValue)
		}
		value, escapeOffset, err := decodeFilterValue(rawValue)
		if err != nil {
			return nil, filterErrorf(valueOffset+escapeOffset, "%s", err.Error())
		}
		return p.parseMembershipTermLeaf(token.offset, field, value)
	case comparisonFilterFields[field]:
		if operator == ":" {
			return nil, filterErrorf(token.offset, "field %s requires =, >, >=, <, or <= comparisons", fieldText)
		}
		valueOffset := token.offset + valueOffsetInToken
		if filterValueStartsEntityIDLiteral(rawValue) {
			return nil, filterErrorf(valueOffset, "field %s does not accept entity-ID literals", fieldText)
		}
		value, escapeOffset, err := decodeFilterValue(rawValue)
		if err != nil {
			return nil, filterErrorf(valueOffset+escapeOffset, "%s", err.Error())
		}
		return p.parseComparisonTermLeaf(token.offset, field, FilterCompareOp(operator), value)
	default:
		return nil, filterErrorf(token.offset, "has unknown field %q", fieldText)
	}
}

func filterValueStartsEntityIDLiteral(rawValue string) bool {
	return !filterValueIsQuoted(rawValue) && strings.HasPrefix(rawValue, "#")
}

func parseFilterEntityIDLiteral(rawValue string) (int64, error) {
	digits := strings.TrimPrefix(rawValue, "#")
	if digits == "" || strings.ContainsFunc(digits, func(character rune) bool {
		return character < '0' || character > '9'
	}) {
		return 0, fmt.Errorf("malformed entity-ID literal")
	}
	entityID, err := strconv.ParseInt(digits, 10, 64)
	if err != nil || entityID <= 0 {
		return 0, fmt.Errorf("malformed entity-ID literal")
	}
	return entityID, nil
}

// splitFilterTerm separates one raw term into its field, operator, and raw value.
func splitFilterTerm(text string) (string, string, string, int, error) {
	inQuotes := false
	for index := 0; index < len(text); index++ {
		character := text[index]
		if character == '"' {
			inQuotes = !inQuotes
			continue
		}
		if inQuotes {
			if character == '\\' {
				index++
			}
			continue
		}
		switch character {
		case ':':
			return splitFilterTermParts(text, index, index+1, ":")
		case '>', '<':
			if index+1 < len(text) && text[index+1] == '=' {
				return splitFilterTermParts(text, index, index+2, string(character)+"=")
			}
			return splitFilterTermParts(text, index, index+1, string(character))
		case '=':
			return splitFilterTermParts(text, index, index+1, "=")
		}
	}
	return "", "", "", 0, fmt.Errorf("term %q needs a field:value, field=value, field>value, field>=value, field<value, or field<=value form", text)
}

func splitFilterTermParts(text string, operatorOffset int, valueStart int, operator string) (string, string, string, int, error) {
	field := strings.TrimSpace(text[:operatorOffset])
	rawValue := text[valueStart:]
	trimmedValue := strings.TrimLeft(rawValue, " \t\n\r")
	valueOffset := valueStart + len(rawValue) - len(trimmedValue)
	return field, operator, strings.TrimSpace(trimmedValue), valueOffset, nil
}

func filterValueIsQuoted(value string) bool {
	if len(value) < 2 || value[0] != '"' {
		return false
	}
	end, err := scanFilterQuoted(value, 0)
	return err == nil && end == len(value)
}

func decodeFilterValue(rawValue string) (string, int, error) {
	if !filterValueIsQuoted(rawValue) {
		return rawValue, 0, nil
	}
	value := rawValue[1 : len(rawValue)-1]
	if !strings.ContainsRune(value, '\\') {
		return value, 0, nil
	}
	decoded := strings.Builder{}
	for index := 0; index < len(value); index++ {
		if value[index] != '\\' {
			decoded.WriteByte(value[index])
			continue
		}
		if index+1 >= len(value) || (value[index+1] != '\\' && value[index+1] != '"' && value[index+1] != '*') {
			return "", index + 1, fmt.Errorf("invalid quoted-value escape")
		}
		decoded.WriteByte(value[index+1])
		index++
	}
	return decoded.String(), 0, nil
}

func (p *filterParser) parseMembershipTermLeaf(offset int, field FilterField, value string) (FilterExpression, error) {
	switch field {
	case FilterFieldMember:
		if value == "" {
			return nil, filterErrorf(offset, "member value must be a member name")
		}
		return &FilterMemberTerm{Name: value}, nil
	case FilterFieldCurrency:
		currency := normalizeFilterCurrency(value)
		if !values.ValidCurrencyCode(currency) {
			return nil, filterErrorf(offset,
				"currency value must use ISO 4217 or the C:: crypto prefix")
		}
		return &FilterCurrencyTerm{Currency: currency}, nil
	default:
		if !validFilterEnumValue(field, value) {
			return nil, filterErrorf(offset, "field %s has unknown value %q", field, value)
		}
		return &FilterEnumTerm{Field: field, Value: value}, nil
	}
}

func parseFilterEntityTermLeaf(offset int, valueOffset int, field FilterField, rawValue string) (FilterExpression, error) {
	value := rawValue
	quoted := filterValueIsQuoted(value)
	if quoted {
		value = value[1 : len(value)-1]
	}
	if value == "*" {
		return &FilterEntityTerm{Field: field, Scoped: true}, nil
	}
	scoped := strings.HasSuffix(value, ":*")
	if scoped {
		value = strings.TrimSuffix(value, ":*")
		if value == "" {
			return nil, filterErrorf(offset, "entity scope %q is missing a base FQN", rawValue)
		}
	}
	fqn := value
	if quoted {
		var (
			err          error
			escapeOffset int
		)
		fqn, escapeOffset, err = decodeFilterValue(`"` + value + `"`)
		if err != nil {
			return nil, filterErrorf(valueOffset+escapeOffset, "%s", err.Error())
		}
	}
	if err := services.ValidateFQN(fqn); !utf8.ValidString(fqn) || err != nil {
		return nil, filterErrorf(offset, "entity value %q must be a valid FQN", fqn)
	}
	return &FilterEntityTerm{Field: field, FQN: fqn, Scoped: scoped}, nil
}

func validFilterEnumValue(field FilterField, value string) bool {
	switch field {
	case FilterFieldRole:
		return validRecordRole(RecordRole(value))
	case FilterFieldClass:
		return validTransactionClass(TransactionClass(value))
	case FilterFieldLifecycle:
		return validLifecycleStatus(LifecycleStatus(value))
	case FilterFieldSettlement:
		return validSettlementSummary(SettlementSummary(value))
	case FilterFieldShape:
		return validTransactionShape(TransactionShapeType(value))
	default:
		return false
	}
}

func normalizeFilterCurrency(value string) string {
	if len(value) >= 3 && strings.EqualFold(value[:3], "C::") {
		return "C::" + value[3:]
	}
	return strings.ToUpper(value)
}

func (p *filterParser) parseComparisonTermLeaf(offset int, field FilterField, op FilterCompareOp, value string) (FilterExpression, error) {
	switch field {
	case FilterFieldAmount, FilterFieldAmountUSD:
		amount, err := values.ParseDecimal(value)
		if err != nil {
			return nil, filterErrorf(offset, "field %s needs a decimal with at most 10 integer digits and 8 fractional digits", field)
		}
		return &FilterDecimalTerm{Field: field, Op: op, Value: amount}, nil
	case FilterFieldInitiated:
		date, err := p.parseFilterCivilDate(value)
		if err != nil {
			if errors.Is(err, errFilterRelativeMagnitudeLimit) {
				return nil, filterErrorf(offset, "relative-offset magnitude must be at most %d units", maxFilterRelativeMagnitude)
			}
			return nil, filterErrorf(offset,
				"field initiated needs YYYY-MM-DD, RFC3339, or a relative offset like -30d")
		}
		return &FilterDateTerm{Op: op, Date: date}, nil
	default:
		timestamp, err := parseFilterInstant(value, p)
		if err != nil {
			if errors.Is(err, errFilterRelativeMagnitudeLimit) {
				return nil, filterErrorf(offset, "relative-offset magnitude must be at most %d units", maxFilterRelativeMagnitude)
			}
			return nil, filterErrorf(offset, "field %s needs YYYY-MM-DD, RFC3339, or a relative offset like -30d", field)
		}
		return &FilterTimestampTerm{Field: field, Op: op, Time: timestamp}, nil
	}
}

var filterRelativePattern = regexp.MustCompile(`^([+-])(\d+)(s|m|h|d|w|mo|y)$`)

var errFilterRelativeMagnitudeLimit = errors.New("filter relative-offset magnitude exceeds limit")

func (p *filterParser) parseFilterRelativeTime(value string) (time.Time, bool, error) {
	match := filterRelativePattern.FindStringSubmatch(value)
	if match == nil {
		return time.Time{}, false, nil
	}
	magnitude, err := strconv.Atoi(match[2])
	if err != nil || magnitude > maxFilterRelativeMagnitude {
		return time.Time{}, true, errFilterRelativeMagnitudeLimit
	}
	sign := 1
	if match[1] == "-" {
		sign = -1
	}
	switch match[3] {
	case "y":
		return p.now.AddDate(sign*magnitude, 0, 0), true, nil
	case "mo":
		return p.now.AddDate(0, sign*magnitude, 0), true, nil
	case "w":
		return p.now.AddDate(0, 0, sign*magnitude*7), true, nil
	case "d":
		return p.now.Add(time.Duration(sign*magnitude) * 24 * time.Hour), true, nil
	case "h":
		return p.now.Add(time.Duration(sign*magnitude) * time.Hour), true, nil
	case "m":
		return p.now.Add(time.Duration(sign*magnitude) * time.Minute), true, nil
	default:
		return p.now.Add(time.Duration(sign*magnitude) * time.Second), true, nil
	}
}

func (p *filterParser) parseFilterCivilDate(value string) (values.CivilDate, error) {
	if date, err := values.ParseCivilDate(value); err == nil {
		return date, nil
	}
	if instant, ok, err := p.parseFilterRelativeTime(value); ok {
		if err != nil {
			return values.CivilDate{}, err
		}
		return values.CivilDateFromTime(instant.UTC()), nil
	}
	if instant, err := time.Parse(time.RFC3339, value); err == nil {
		return values.CivilDateFromTime(instant.UTC()), nil
	}
	return values.CivilDate{}, fmt.Errorf("invalid filter civil-date value")
}

func parseFilterInstant(value string, p *filterParser) (time.Time, error) {
	if instant, ok, err := p.parseFilterRelativeTime(value); ok {
		if err != nil {
			return time.Time{}, err
		}
		return instant.UTC(), nil
	}
	if instant, err := time.Parse(time.RFC3339, value); err == nil {
		return instant.UTC(), nil
	}
	if date, err := values.ParseCivilDate(value); err == nil {
		return date.Time().UTC(), nil
	}
	return time.Time{}, fmt.Errorf("invalid filter time value")
}
