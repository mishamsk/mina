package transactions

import (
	"context"
	"errors"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/accounts"
	"github.com/mishamsk/mina/internal/services/categories"
	"github.com/mishamsk/mina/internal/services/members"
	"github.com/mishamsk/mina/internal/services/tags"
)

func (s *Service) resolveFilterReferences(ctx context.Context, expression FilterExpression) error {
	switch node := expression.(type) {
	case *FilterAnd:
		for _, term := range node.Terms {
			if err := s.resolveFilterReferences(ctx, term); err != nil {
				return err
			}
		}
	case *FilterOr:
		for _, term := range node.Terms {
			if err := s.resolveFilterReferences(ctx, term); err != nil {
				return err
			}
		}
	case *FilterNot:
		return s.resolveFilterReferences(ctx, node.Term)
	case *FilterEntityTerm:
		if node.Scoped {
			return nil
		}
		var (
			referenceID int64
			err         error
		)
		switch node.Field {
		case FilterFieldAccount:
			reference, referenceErr := s.accounts.ActiveReferenceByFQN(ctx, node.FQN, accounts.ReferenceOptions{AllowHidden: true})
			err = referenceErr
			referenceID = reference.ID
		case FilterFieldCategory:
			reference, referenceErr := s.categories.ActiveReferenceByFQN(ctx, node.FQN, categories.ReferenceOptions{AllowHidden: true})
			err = referenceErr
			referenceID = reference.ID
		case FilterFieldTag:
			reference, referenceErr := s.tags.ActiveReferenceByFQN(ctx, node.FQN, tags.ReferenceOptions{AllowHidden: true})
			err = referenceErr
			referenceID = reference.ID
		}
		if errors.Is(err, services.ErrInvalidReference) {
			return invalidTransactionFilterReferenceError()
		}
		if err != nil {
			return err
		}
		node.EntityID = referenceID
		return nil
	case *FilterMemberTerm:
		reference, err := s.members.ActiveReferenceByName(ctx, node.Name, members.ReferenceOptions{AllowHidden: true})
		if errors.Is(err, services.ErrInvalidReference) {
			return invalidTransactionFilterReferenceError()
		}
		if err != nil {
			return err
		}
		node.MemberID = reference.ID
	}
	return nil
}
