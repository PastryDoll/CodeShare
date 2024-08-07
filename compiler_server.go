package main

import (
	"bufio"
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

			cmd := exec.Command("python3", "-u", "-c", req.Code) // Use the -u flag to unbuffer Python output
			stdout, err := cmd.StdoutPipe()
			if err != nil {
				http.Error(w, "Error creating output pipe", http.StatusInternalServerError)
				return
			}

			if err := cmd.Start(); err != nil {
				http.Error(w, "Error starting command", http.StatusInternalServerError)
				return
			}

			flusher, ok := w.(http.Flusher)
			if !ok {
				http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
				return
			}

			w.Header().Set("Content-Type", "text/plain")
			w.WriteHeader(http.StatusOK)

			scanner := bufio.NewScanner(stdout)
			for scanner.Scan() {
				m := scanner.Text()
				log.Printf("Out: %s", m)
				_, _ = w.Write([]byte(m + "\n"))
				flusher.Flush()
			}
			if err := cmd.Wait(); err != nil {
				log.Printf("Command error: %v", err)
			}
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
