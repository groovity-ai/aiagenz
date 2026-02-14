package domain

// Plan represents a resource plan for deploying agents.
type Plan struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	CPU       float64 `json:"cpu"`       // vCPU count (e.g. 0.5, 1, 2)
	MemoryMB  int64   `json:"memoryMb"`  // RAM in MB
	StorageGB int     `json:"storageGb"` // Disk storage in GB
	EgressGB  int     `json:"egressGb"`  // Monthly egress in GB
	PriceUSD  int     `json:"priceUsd"`  // Monthly price in USD cents (500 = $5)
	Popular   bool    `json:"popular"`   // Show "Most Popular" badge
}

// AvailablePlans returns all available plans.
func AvailablePlans() []Plan {
	return []Plan{
		{
			ID:        "starter",
			Name:      "Starter",
			CPU:       0.5,
			MemoryMB:  512,
			StorageGB: 5,
			EgressGB:  50,
			PriceUSD:  500, // $5/mo
			Popular:   false,
		},
		{
			ID:        "pro",
			Name:      "Pro",
			CPU:       1,
			MemoryMB:  1024,
			StorageGB: 20,
			EgressGB:  200,
			PriceUSD:  1500, // $15/mo
			Popular:   true,
		},
		{
			ID:        "business",
			Name:      "Business",
			CPU:       2,
			MemoryMB:  2048,
			StorageGB: 50,
			EgressGB:  500,
			PriceUSD:  4000, // $40/mo
			Popular:   false,
		},
	}
}

// GetPlan returns the plan for a given ID, or the starter plan if not found.
func GetPlan(id string) Plan {
	for _, p := range AvailablePlans() {
		if p.ID == id {
			return p
		}
	}
	return AvailablePlans()[0] // default to starter
}
