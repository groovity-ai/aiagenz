package service

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// MonitorService handles periodic collection of container metrics.
type MonitorService struct {
	db        *pgxpool.Pool
	container *ContainerService
	
	// Cache for CPU calculation
	mu          sync.Mutex
	lastCPUStats map[string]cpuStat
}

type cpuStat struct {
	TotalUsage  float64
	SystemUsage float64
	Timestamp   time.Time
}

// NewMonitorService creates a new monitor service.
func NewMonitorService(db *pgxpool.Pool, container *ContainerService) *MonitorService {
	return &MonitorService{
		db:           db,
		container:    container,
		lastCPUStats: make(map[string]cpuStat),
	}
}

// Start begins the monitoring loop in a background goroutine.
func (s *MonitorService) Start(ctx context.Context) {
	// Start immediately, then ticker
	go func() {
		s.collectMetrics(context.Background())
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.collectMetrics(context.Background())
			}
		}
	}()
}

// collectMetrics iterates over active projects and records their stats.
func (s *MonitorService) collectMetrics(ctx context.Context) {
	// 1. Get all running projects
	rows, err := s.db.Query(ctx, "SELECT id, container_id FROM projects WHERE status = 'running' AND container_id != '' AND container_id IS NOT NULL")
	if err != nil {
		log.Printf("[Monitor] Failed to fetch running projects: %v", err)
		return
	}
	defer rows.Close()

	// Collect data to slice first to avoid long transaction on rows iteration
	type projectInfo struct {
		ID          string
		ContainerID string
	}
	var projects []projectInfo
	for rows.Next() {
		var p projectInfo
		if err := rows.Scan(&p.ID, &p.ContainerID); err == nil {
			projects = append(projects, p)
		}
	}
	rows.Close()

	for _, p := range projects {
		// 2. Get stats from Docker
		stats, err := s.container.Stats(ctx, p.ContainerID)
		if err != nil {
			log.Printf("[Monitor] Failed to get stats for project %s: %v", p.ID, err)
			continue
		}

		// 3. Extract metrics
		// CPU needs delta calculation because stream=false gives absolute values
		cpuRaw, _ := stats["cpu_stats"].(map[string]interface{})
		cpuUsage := getNestedFloat(cpuRaw, "cpu_usage", "total_usage")
		systemUsage := getNestedFloat(cpuRaw, "system_cpu_usage")
		
		cpuPercent := 0.0
		
		s.mu.Lock()
		lastStat, exists := s.lastCPUStats[p.ContainerID]
		s.lastCPUStats[p.ContainerID] = cpuStat{
			TotalUsage:  cpuUsage,
			SystemUsage: systemUsage,
			Timestamp:   time.Now(),
		}
		s.mu.Unlock()

		if exists && systemUsage > lastStat.SystemUsage {
			cpuDelta := cpuUsage - lastStat.TotalUsage
			systemDelta := systemUsage - lastStat.SystemUsage
			
			// Get online CPUs count if available, default to 1
			onlineCPUs := 1.0
			v := getNestedFloat(cpuRaw, "online_cpus")
			if v > 0 {
				onlineCPUs = v
			} else {
				// Fallback: check percpu_usage length
				if percpu, ok := getNestedFloatList(cpuRaw, "cpu_usage", "percpu_usage"); ok {
					onlineCPUs = float64(len(percpu))
				}
			}

			if systemDelta > 0 && cpuDelta > 0 {
				cpuPercent = (cpuDelta / systemDelta) * onlineCPUs * 100.0
			}
		}

		// Fallback: If container.Stats() already calculated it (some versions do)
		if v, ok := stats["cpu_percent"].(float64); ok && v > 0 {
			cpuPercent = v
		}

		memPercent, _ := stats["memory_percent"].(float64)
		memUsage, _ := stats["memory_usage_mb"].(float64)

		// 4. Save to DB
		_, err = s.db.Exec(ctx, `
            INSERT INTO metrics (project_id, cpu_percent, memory_percent, memory_usage_mb, timestamp)
            VALUES ($1, $2, $3, $4, NOW())
        `, p.ID, cpuPercent, memPercent, memUsage)

		if err != nil {
			log.Printf("[Monitor] Failed to save metrics for %s: %v", p.ID, err)
		}
	}

	// 5. Cleanup old metrics (keep 24h)
	_, _ = s.db.Exec(ctx, "DELETE FROM metrics WHERE timestamp < NOW() - INTERVAL '24 hours'")
}

func getNestedFloatList(m map[string]interface{}, keys ...string) ([]interface{}, bool) {
	current := m
	for i, key := range keys {
		if i == len(keys)-1 {
			if v, ok := current[key].([]interface{}); ok {
				return v, true
			}
			return nil, false
		}
		if nested, ok := current[key].(map[string]interface{}); ok {
			current = nested
		} else {
			return nil, false
		}
	}
	return nil, false
}
