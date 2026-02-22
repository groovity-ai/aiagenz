package main

import (
    "database/sql"
    "fmt"
    _ "github.com/lib/pq"
    "log"
)

func main() {
    connStr := "postgres://aiagenz:rahasia_bos@localhost:5433/aiagenz?sslmode=disable"
    db, err := sql.Open("postgres", connStr)
    if err != nil {
        log.Fatal(err)
    }

    rows, err := db.Query("SELECT id, user_id, name FROM projects LIMIT 10")
    if err != nil {
        log.Fatal(err)
    }
    defer rows.Close()

    fmt.Println("Projects found:")
    for rows.Next() {
        var id, userID, name string
        if err := rows.Scan(&id, &userID, &name); err != nil {
            log.Fatal(err)
        }
        fmt.Printf("Project ID: %s, User ID: %s, Name: %s\n", id, userID, name)
    }
}
