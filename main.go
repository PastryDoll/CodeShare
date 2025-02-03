package main

import (
	"bufio"
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"

	"golang.org/x/net/websocket"
)

type Position struct {
	Line int `json:"line"`
	Ch   int `json:"ch"`
}

type Change struct {
	From Position `json:"from"`
	To   Position `json:"to"`
	Text []string `json:"text"`
	Id   uint64   `json:"id"`
}

type Message struct {
	ChatMsg    string `json:"ChatMsg,omitempty"`
	ClientId   string `json:"ClientId,omitempty"`
	AdminId    string `json:"AdminId,omitempty"`
	Action     string `json:"Action,omitempty"`
	Password   string `json:"Password,omitempty"`
	Clients    string `json:"Clients,omitempty"`
	TransferId string `json:"TransferId,omitempty"`
	AdminKey   string `json:"AdminKey,omitempty"`
	EditorKey  string `json:"EditorKey,omitempty"`

	// Code Changes
	Code    string `json:"Code,omitempty"`
	Changes Change `json:"Changes,omitempty"`
}

var (
	clients              = make(map[*websocket.Conn]string)
	broadcast            = make(chan Message)
	mutex                sync.Mutex
	adminPassword        string = "123"
	adminId              string = ""
	adminKey             string = ""
	editorId             string = ""
	editorKey            string = ""
	editorChangesHistory []Change
	editorChangesQueue          = make(chan []byte, 100)
	currChangeId         uint64 = 0
)

const (
	codePath string = "data/document.txt"
)

func main() {

	// Make empty code file
	if err := os.WriteFile(codePath, []byte(""), 0644); err != nil {
		log.Printf("Failed to write to file: %v", err)
		return
	}

	//
	//// Send changes to Node parsing process
	//

	go processChanges()

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

	// TODO(Caio) Start ussing http instead of WS for most of the things
	//
	//// Login
	//
	// http.HandleFunc("/send-password", func(w http.ResponseWriter, r *http.Request) {
	// 	if r.Method != http.MethodPost {
	// 		http.Error(w, "Invalid request method", http.StatusMethodNotAllowed)
	// 		return
	// 	}
	// 	log.Print("Login requested")

	// })

	//
	//// Compile & Run
	//
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
			flusher.Flush() // When Flush is present ResponseWriter sets the Transfer-Encoding to chunked
		}
		if err := cmd.Wait(); err != nil {
			log.Printf("Command error: %v", err)
		}
		log.Printf("Execution finished")
	})

	//
	//// Receive document upload and update document on db
	//
	http.HandleFunc("/upload-doc", func(w http.ResponseWriter, r *http.Request) {

		var req struct {
			Doc       string `json:"doc"`
			EditorKey string `json:"editorKey"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		log.Printf("Authenticating editorKey. Server: %s, Client: %s", editorKey, req.EditorKey)
		if req.EditorKey != editorKey {
			http.Error(w, "Unauthorized: Invalid editorKey", http.StatusUnauthorized)
			return
		}

		if err := os.WriteFile(codePath, []byte(req.Doc), 0644); err != nil {
			log.Printf("Failed to write to file: %v", err)
			http.Error(w, "Unable to save file", http.StatusInternalServerError)
			return
		}

		log.Printf("document successfully updated with new content. %s", codePath)

		response := map[string]string{
			"status":  "success",
			"message": "Code received successfully",
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(response)
	})

	// Start server
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

	// Get current saved code
	var codeFile []byte
	codeFile, err := os.ReadFile(codePath)
	if err != nil {
		log.Printf("Failed to read file: %v", err)
		msg := Message{Action: "Failed to read codefile"}
		websocket.JSON.Send(ws, msg)
		ws.Close()
		return
	}

	// Broadcast new client to everyone
	msg.ClientId = clientId
	msg.AdminId = adminId
	msg.Action = "sayhello"
	msg.Code = string(codeFile)
	broadcast <- msg

	msg.Action = "hello"
	// If new client is admin we send the password, else we say hello with no password to client
	if adminId == "" {
		mutex.Lock()

		adminId = clientId
		editorId = clientId
		msg.Password = adminPassword
		log.Printf("Client %s is first user... sending admin password", clientId)
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
		log.Printf("Received message: %+v", msg)

		// Validate message
		if msg.ClientId != clients[ws] {
			log.Printf("Client %s is trying to impersonate %s. Shutting down potential malicious client", msg.ClientId, clients[ws])
			break
		}

		switch msg.Action {

		case "authenticate":

			// Not right password
			if msg.Password != adminPassword {
				log.Printf("Client %s failed to authenticate with password: %s", msg.ClientId, msg.Password)
				continue
			}

			// Deauth previous admin
			if adminId != msg.ClientId && adminId != "" {
				log.Printf("Client %s deauthenticated as admin, new admin is %s", adminId, msg.ClientId)
				deauthMsg := Message{ClientId: adminId, Action: "deauthenticated"}
				broadcast <- deauthMsg
			}

			// Auth Current admin
			mutex.Lock()
			adminKey = generateAuthKey()
			editorKey = generateAuthKey()
			adminId = msg.ClientId
			editorId = msg.ClientId
			mutex.Unlock()

			log.Printf("Client %s authenticated as admin", msg.ClientId)
			successMsg := Message{ClientId: msg.ClientId, Action: "authenticated"}
			keyMsg := Message{ClientId: msg.ClientId, Action: "transferKeys", AdminKey: adminKey, EditorKey: editorKey}
			if err := websocket.JSON.Send(ws, keyMsg); err != nil {
				log.Printf("Error sending client adminKey: %v", err)
			}
			broadcast <- successMsg

		case "transfer":

			// Only admin can transfer..
			if msg.Password != adminPassword {
				log.Printf("Client %s failed to authenticate with password: %s", msg.ClientId, msg.Password)
				break
			}
			editorId = msg.TransferId
			editorKey = generateAuthKey()
			msgNoPass := msg
			msgNoPass.EditorKey = editorKey
			msgNoPass.Password = ""
			log.Printf("Client %s became editor", editorId)
			broadcast <- msgNoPass

		case "chat":
			broadcast <- msg
			log.Printf("Message sent: %s, by %s", msg.ChatMsg, msg.ClientId)

		case "codechange":
			if msg.ClientId == editorId {
				msg.Changes.Id = currChangeId
				currChangeId += 1
				editorChangesHistory = append(editorChangesHistory, msg.Changes)
				changesJSON, err := json.Marshal(msg.Changes)
				if err != nil {
					fmt.Printf("Error serializing changes: %v\n", err)
					return
				}
				editorChangesQueue <- changesJSON
				broadcast <- msg
				log.Printf("Code update: %s, by %s", msg.Changes.Text, msg.ClientId)
			} else {
				log.Printf("Unauthorized attempt to send code by client %s", msg.ClientId)
			}
		default:

			if msg.ClientId == editorId {
				broadcast <- msg
				log.Printf("Code update: %s, by %s", msg.Changes.Text, msg.ClientId)
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
			if msg.Action == "codechange" {
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

func processChanges() {
	for changesJSON := range editorChangesQueue {
		cmd := exec.Command("node", "editor_parser/editor_parser.js")
		cmd.Stdin = bytes.NewBuffer(changesJSON)
		var out bytes.Buffer
		cmd.Stdout = &out

		err := cmd.Run()
		if err != nil {
			fmt.Printf("Error running Node.js script: %v\n", err)
			return
		}
		fmt.Printf("Node.js script output: %s\n", out.String())
	}
}

func generateAuthKey() string {
	keyLength := 16
	bytes := make([]byte, keyLength)

	_, err := rand.Read(bytes)
	if err != nil {
		panic("Failed to generate random key: " + err.Error())
	}
	return hex.EncodeToString(bytes)
}
