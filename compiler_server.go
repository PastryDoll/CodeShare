package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os/exec"
)

func main() {
	fileServer := http.FileServer(http.Dir("."))
	http.Handle("/", fileServer)

	http.HandleFunc("/run", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			var req struct {
				Code string `json:"code"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "Invalid request", http.StatusBadRequest)
				return
			}

			cmd := exec.Command("python3", "-c", req.Code)
			output, err := cmd.CombinedOutput()
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte("Error executing code: " + err.Error()))
				return
			}

			w.Header().Set("Content-Type", "text/plain")
			w.Write(output)
		} else {
			http.Error(w, "Unsupported method", http.StatusMethodNotAllowed)
		}
	})

	addr := ":8080"
	log.Printf("Starting server on http://localhost%s\n", addr)

	err := http.ListenAndServe(addr, nil)
	if err != nil {
		log.Fatalf("Could not start server: %s\n", err.Error())
	}
}
