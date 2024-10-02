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
	Code     string `json:"code,omitempty"`
	ClientId string `json:"client_id,omitempty"`
	Action   string `json:"action,omitempty"`
	Password string `json:"password,omitempty"`
}

var (
	clients       = make(map[*websocket.Conn]string)
	broadcast     = make(chan Message)
	mutex         sync.Mutex
	clientCounter int    = 0
	adminPassword string = "123"
	adminId       string = ""
	editorId      string = ""
)

func main() {

	//
	//// Serving Websocket
	//
	http.Handle("/ws", websocket.Handler(handleConnections))
	go handleMessages()

	//
	//// Serving directory
	//
	fileServer := http.FileServer(http.Dir("."))
	http.Handle("/", fileServer)

	http.HandleFunc("/run", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {

			var req struct {
				Code string `json:"code"`
			}
			log.Print("Execution requested!")

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

			log.Printf("Executing: %s", req.Code)

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
	clientId := generateClientID()
	responseData := map[string]string{
		"ClientId": clientId,
		"Action":   "hello"}

	// Register new client and set admin
	mutex.Lock()
	clients[ws] = clientId
	if adminId == "" {
		adminId = clientId
		editorId = clientId
		responseData["Password"] = adminPassword
		log.Printf("Client %s is now the admin", clientId)
	}
	mutex.Unlock()

	log.Printf("Client %s connected", clientId)

	// Send the client ID to the client
	if err := websocket.JSON.Send(ws, responseData); err != nil {
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

		if msg.Action == "authenticate" {
			if msg.Password == adminPassword {
				mutex.Lock()
				adminId = msg.ClientId
				mutex.Unlock()
				log.Printf("Client %s authenticated as admin", msg.ClientId)
				successMsg := map[string]string{
					"ClientId": msg.ClientId,
					"Action":   "authenticated"}
				if err := websocket.JSON.Send(ws, successMsg); err != nil {
					log.Printf("Error sending client ID: %v", err)
					ws.Close()
					return
				}
			} else {
				log.Printf("Client %s failed to authenticate with password: %s", msg.ClientId, msg.Password)
			}

		} else {
			if msg.ClientId == adminId {
				broadcast <- msg
				log.Printf("Code update: %s, by %s", msg.Code, msg.ClientId)
			} else {
				log.Printf("Unauthorized attempt to send code by client %s", msg.ClientId)
			}
		}
	}

	mutex.Lock()
	delete(clients, ws)
	mutex.Unlock()
	ws.Close()
}

func handleMessages() {
	for {
		msg := <-broadcast

		mutex.Lock()
		for client, clientId := range clients {
			if clientId != msg.ClientId {
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
