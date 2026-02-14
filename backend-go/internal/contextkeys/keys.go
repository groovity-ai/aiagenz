package contextkeys

// contextKey is an unexported type for context keys to prevent collisions.
type contextKey string

const (
	// UserID is the context key for the authenticated user's ID.
	UserID contextKey = "userID"
	// UserEmail is the context key for the authenticated user's email.
	UserEmail contextKey = "userEmail"
	// UserRole is the context key for the authenticated user's role.
	UserRole contextKey = "userRole"
)
