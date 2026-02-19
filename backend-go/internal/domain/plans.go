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
			ID:        "lite",
			Name:      "Lite",
			CPU:       0.5,
			MemoryMB:  1024,
			StorageGB: 2,
			EgressGB:  10,
			PriceUSD:  400, // $4/mo
			Popular:   false,
		},
		{
			ID:        "starter",
			Name:      "Starter",
			CPU:       1,
			MemoryMB:  2048,
			StorageGB: 10,
			EgressGB:  100,
			PriceUSD:  900,  // $9/mo
			Popular:   true, // Flag Starter as Popular/Default-ish
		},
		{
			ID:        "pro",
			Name:      "Pro",
			CPU:       2,
			MemoryMB:  4096,
			StorageGB: 50,
			EgressGB:  500,
			PriceUSD:  2900, // $29/mo
			Popular:   false,
		},
		{
			ID:        "business",
			Name:      "Business",
			CPU:       4,
			MemoryMB:  8192,
			StorageGB: 100,
			EgressGB:  1000,
			PriceUSD:  7900, // $79/mo
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
