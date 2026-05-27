package controllers

// Controllers groups domain use cases wired into routers.
type Controllers struct{}

// New creates the Stage 1 controller registry.
func New() *Controllers {
	return &Controllers{}
}
