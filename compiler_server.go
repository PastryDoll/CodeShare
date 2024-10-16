package main

import (
	"bufio"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os/exec"
	"strings"
	"sync"

	"golang.org/x/net/websocket"
)

type Message struct {
	Code       string `json:"Code,omitempty"`
	ChatMsg    string `json:"ChatMsg,omitempty"`
	ClientId   string `json:"ClientId,omitempty"`
	AdminId    string `json:"AdminId,omitempty"`
	Action     string `json:"Action,omitempty"`
	Password   string `json:"Password,omitempty"`
	Clients    string `json:"Clients,omitempty"`
	TransferId string `json:"TransferId,omitempty"`
}

var (
	clients       = make(map[*websocket.Conn]string)
	broadcast     = make(chan Message)
	mutex         sync.Mutex
	clientCounter int    = 0
	adminPassword string = "123"
	adminId       string = ""
	adminWs       *websocket.Conn
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
		if r.Method != http.MethodPost {
			http.Error(w, "Invalid request method", http.StatusMethodNotAllowed)
			return
		}
		log.Print("Run code requested!")
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
	})

	addr := ":8080"
	log.Printf("Starting server on http://localhost%s\n", addr)

	err := http.ListenAndServe(addr, nil)
	if err != nil {
		log.Fatalf("Could not start server: %s\n", err.Error())
	}
}

func handleConnections(ws *websocket.Conn) {
	var msg Message

	clientId := ws.Request().URL.Query().Get("clientId")
	if clientId == "" {
		log.Printf("Client ID is in use: %s", clientId)
		msg := Message{Action: "validation_failed"}
		websocket.JSON.Send(ws, msg)
		ws.Close()
		return
	}
	// Check if clientid exists or Broadcast all clients
	mutex.Lock()
	{
		var clientIDs []string
		for _, clientID := range clients {
			clientIDs = append(clientIDs, clientID)
			if clientID == clientId {
				log.Printf("Client ID is in use: %s", clientId)
				msg := Message{Action: "failed"}
				websocket.JSON.Send(ws, msg)
				ws.Close()
				mutex.Unlock()
				return
			}
		}
		clientIDs = append(clientIDs, clientId)
		msg.Clients = strings.Join(clientIDs, ",")
	}
	// Register new client and set admin
	clients[ws] = clientId
	mutex.Unlock()

	log.Printf("Client %s connected", clientId)

	msg.ClientId = clientId
	msg.AdminId = adminId

	// Broadcast new client to everyone
	msg.AdminId = adminId
	msg.Action = "sayhello"
	broadcast <- msg

	msg.Action = "hello"
	// If new client is admin we send the password, else we say hello with no password to client
	if adminId == "" {
		mutex.Lock()

		adminId = clientId
		editorId = clientId
		msg.Password = adminPassword
		log.Printf("Client %s is now the admin", clientId)
		if err := websocket.JSON.Send(ws, msg); err != nil {
			log.Printf("Error sending client authentication: %v", err)
		}

		mutex.Unlock()
	} else {

		mutex.Lock()

		if err := websocket.JSON.Send(ws, msg); err != nil {
			log.Printf("Error sending Hello: %v", err)
			ws.Close()
			return
		}

		mutex.Unlock()
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
		log.Printf("Received message: %s", msg)

		// Validate message
		if msg.ClientId != clients[ws] {
			log.Printf("Client %s is trying to impersonate %s. Shutting down potential malicious client", msg.ClientId, clients[ws])
			break
		}

		if msg.Action == "authenticate" {

			// Not right password
			if msg.Password != adminPassword {
				log.Printf("Client %s failed to authenticate with password: %s", msg.ClientId, msg.Password)
				continue
			}

			// Deauth previous a admin
			if adminId != msg.ClientId && adminId != "" {
				log.Printf("Client %s deauthenticated as admin, new admin is %s", adminId, msg.ClientId)
				deauthMsg := Message{ClientId: adminId, Action: "deauthenticated"}
				broadcast <- deauthMsg
			}

			// Auth Current admin
			mutex.Lock()
			adminId = msg.ClientId
			editorId = msg.ClientId
			adminWs = ws
			mutex.Unlock()

			log.Printf("Client %s authenticated as admin", msg.ClientId)
			successMsg := Message{ClientId: msg.ClientId, Action: "authenticated"}
			broadcast <- successMsg

		} else if msg.Action == "transfer" {

			// Only admin can transfer..
			if msg.Password != adminPassword {
				log.Printf("Client %s failed to authenticate with password: %s", msg.ClientId, msg.Password)
				break
			}
			editorId = msg.TransferId
			msgNoPass := msg
			msgNoPass.Password = ""
			log.Printf("Client %s became editor", editorId)
			broadcast <- msgNoPass

		} else if msg.Action == "chat" {
			broadcast <- msg
			log.Printf("Message sent: %s, by %s", msg.ChatMsg, msg.ClientId)
		} else {
			if msg.ClientId == editorId {
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
	log.Printf("Clients %s disconnected", clientId)
	// Broadcast all clients
	{
		var msg Message
		msg.Action = "byebye"
		msg.ClientId = clientId
		var clientIDs []string
		for _, clientID := range clients {
			clientIDs = append(clientIDs, clientID)
		}
		msg.Clients = strings.Join(clientIDs, ",")
		broadcast <- msg
	}
	ws.Close()
}

func handleMessages() {
	for {
		msg := <-broadcast
		mutex.Lock()
		for client, clientId := range clients {
			if msg.Action == "code" {
				if clientId != msg.ClientId {
					if err := websocket.JSON.Send(client, msg); err != nil {
						log.Printf("Error sending message: %v", err)
						client.Close()
						delete(clients, client)
					}
				}
			} else {
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
