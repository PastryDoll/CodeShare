package main

import (
	"bufio"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os/exec"
	"strconv"
	"sync"

	"golang.org/x/net/websocket"
)

type Message struct {
	Code     string `json:"code"`
	ClientID string `json:"client_id"`
}

var (
	clients       = make(map[*websocket.Conn]string) // Connected clients with IDs
	broadcast     = make(chan Message)               // Broadcast channel
	mutex         sync.Mutex                         // Mutex to protect shared resources
	clientCounter = 0                                // Counter for generating unique client IDs
)

func main() {

	//
	//// Serving directory
	//
	http.Handle("/ws", websocket.Handler(handleConnections))
	go handleMessages()

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
				flusher.Flush() // When FLush is present ResponseWriter sets the Transfer-Encoding to chunked
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

func handleConnections(ws *websocket.Conn) {
	// Generate a unique client ID
	clientID := generateClientID()

	// Register new client
	mutex.Lock()
	clients[ws] = clientID
	mutex.Unlock()

	log.Printf("Client %s connected", clientID)

	// Send the client ID to the client
	if err := websocket.JSON.Send(ws, map[string]string{"your_client_id": clientID}); err != nil {
		log.Printf("Error sending client ID: %v", err)
		ws.Close()
		return
	}

	// Receive messages from the client
	for {
		var msg Message
		if err := websocket.JSON.Receive(ws, &msg); err != nil {
			if err == io.EOF {
				break
			}
			log.Printf("Error receiving message: %v", err)
			break
		}

		// Send the received message to the broadcast channel
		broadcast <- msg
		log.Printf("Message: %s, by %s", msg, clientID)
	}

	// Unregister the client
	mutex.Lock()
	delete(clients, ws)
	mutex.Unlock()
	ws.Close()
}

// Handle messages from the broadcast channel
func handleMessages() {
	for {
		// Grab the next message from the broadcast channel
		msg := <-broadcast

		// Send the message to all clients except the sender
		mutex.Lock()
		for client, clientID := range clients {
			if clientID != msg.ClientID {
				if err := websocket.JSON.Send(client, msg); err != nil {
					log.Printf("Error sending message: %v", err)
					client.Close()
					delete(clients, client)
				}
			}
		}
		mutex.Unlock()
	}
}

func generateClientID() string {
	clientCounter++
	return "client_" + strconv.Itoa(clientCounter)
}
