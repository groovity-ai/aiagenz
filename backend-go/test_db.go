package main

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	connStr := "postgres://aiagenz:rahasia_bos@localhost:5433/aiagenz?sslmode=disable"
	pool, err := pgxpool.New(context.Background(), connStr)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	fmt.Println("--- USERS ---")
	rows, err := pool.Query(context.Background(), "SELECT id, email FROM users LIMIT 10")
	if err != nil {
		log.Printf("Error querying users: %v", err)
	} else {
		for rows.Next() {
			var id, email string
			rows.Scan(&id, &email)
			fmt.Printf("User: ID=%s Email=%s\n", id, email)
		}
		rows.Close()
	}

	fmt.Println("\n--- PROJECTS ---")
	prows, err := pool.Query(context.Background(), "SELECT id, user_id, name FROM projects LIMIT 10")
	if err != nil {
		log.Printf("Error querying projects: %v", err)
	} else {
		for prows.Next() {
			var id, uid, name string
			prows.Scan(&id, &uid, &name)
			fmt.Printf("Project: ID=%s UserID=%s Name=%s\n", id, uid, name)
		}
		prows.Close()
	}
}
