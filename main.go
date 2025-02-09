package main

import (
	"bufio"
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
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

type LoginMessage struct {
	ClientKey     string `json:"ClientKey"`
	Code          string `json:"Code"`
	CodeId        int    `json:"CodeId"`
	ClientList    string `json:"ClientList"`
	AdminPassword string `json:"Password"`
}

var (
	clients              = make(map[*websocket.Conn]string)
	broadcast            = make(chan Message)
	mutex                sync.Mutex
	docFileMutex         sync.Mutex
	adminPassword        string = "123"
	adminId              string = ""
	adminKey             string = ""
	editorId             string = ""
	editorKey            string = ""
	editorChangesHistory []Change
	editorChangesQueue          = make(chan []byte, 100)
	currChangeId         uint64 = 1
	SECRET_256_KEY       []byte = []byte("TOPSECRET")
)

const (
	HTTP_FAILED string = "failed"
	DATA_DIR    string = "data/"
)

func main() {

	// Make empty code file
	docFileMutex.Lock()
	writeToDocument("")
	err := renameDocumentFile("document-0")
	if err != nil {
		log.Printf("Error renaming file: %v", err)
	}
	docFileMutex.Unlock()

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

	http.HandleFunc("/login", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Invalid request method", http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			UserName string `json:"userName"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		clientId := req.UserName
		log.Printf("Login requested, user: %s", clientId)

		var response LoginMessage

		//
		//// Check if username is valid
		//
		mutex.Lock()
		{
			var clientIDs []string
			for _, clientID := range clients {
				if clientID == clientId || clientId == "" {
					log.Printf("Client ID is in use: %s", clientId)
					http.Error(w, "Client ID is already in use, try another one.", http.StatusBadRequest)
					return
				}
				clientIDs = append(clientIDs, clientID)
			}
			response.ClientList = strings.Join(clientIDs, ",") // TODO Let this be a list and deal on the clieny

		}
		mutex.Unlock()
		log.Printf("Client has valid ID: %s", clientId)

		// Get current saved code
		docFileMutex.Lock()
		{
			var docFile []byte
			currCodeId, err := getCurrentCodeId()
			if err != nil {
				fmt.Println("Error getting code id:", err)
				http.Error(w, "", http.StatusInternalServerError)
				return
			}
			currCodeIdInt, err := strconv.Atoi(currCodeId)
			if err != nil {
				http.Error(w, "", http.StatusInternalServerError)
				return
			}
			docPath, err := getDocumentFilePath()
			if err != nil || docPath == "" {
				log.Printf("No document file found: %v", err)
				http.Error(w, "", http.StatusInternalServerError)
				return
			}
			log.Printf("Path: %s", docPath)
			docFile, err = os.ReadFile(docPath)
			if err != nil {
				log.Printf("Failed to read file: %v", err)
				http.Error(w, "", http.StatusInternalServerError)
				return
			}

			response.CodeId = currCodeIdInt
			response.Code = string(docFile)

		}
		docFileMutex.Unlock()

		// If new client is admin we send the password, else we say hello with no password to client
		{
			if adminId == "" {
				mutex.Lock()
				{
					log.Printf("Client %s is first user... sending admin password", clientId)
					adminId = clientId
					editorId = clientId
					response.AdminPassword = adminPassword
				}
				mutex.Unlock()
			}
		}

		response.ClientKey = GenerateSha256(clientId)

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(response); err != nil {
			http.Error(w, "Server failed to encode JSON response", http.StatusInternalServerError)
			return
		}
	})

	//
	//// Sync user code with server
	//
	http.HandleFunc("/sync", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Invalid request method", http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			UserCurrCodeId string `json:"currentCodeId"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		var response struct {
			Status  string   `json:"status"`
			Changes []Change `json:"changes"`
		}

		docFileMutex.Lock()
		missingChanges, err := getUserCodeMissingChanges(req.UserCurrCodeId)
		if err != nil {
			log.Println("Failed to get latest changes: ", err)
		}
		response.Changes = missingChanges
		docFileMutex.Unlock()

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(response); err != nil {
			http.Error(w, "Server failed to encode JSON response", http.StatusInternalServerError)
			return
		}
	})

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

		docFileMutex.Lock()
		writeToDocument(req.Doc)
		docFileMutex.Unlock()

		log.Printf("document successfully updated with new content")

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

	err = http.ListenAndServe(addr, nil)
	if err != nil {
		log.Fatalf("Could not start server: %s\n", err.Error())
	}
}

func handleConnections(ws *websocket.Conn) {
	var msg Message

	clientId := ws.Request().URL.Query().Get("clientId")
	clientKey := ws.Request().URL.Query().Get("clientKey")
	if !ValidateSha256(clientId, clientKey) {
		log.Println("Attempt to connect to ws with invalid key. Closing connection.", clientId, clientKey)
		ws.Close()
	}
	log.Println("WS stablished with: ", clientId, clientKey)
	clients[ws] = clientId

	// Broadcast new client to everyone
	msg.ClientId = clientId
	msg.AdminId = adminId
	msg.Action = "sayhello"
	broadcast <- msg

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
				docFileMutex.Lock()
				editorChangesHistory = append(editorChangesHistory, msg.Changes)
				docFileMutex.Unlock()
				changesJSON, err := json.Marshal(msg.Changes)
				if err != nil {
					fmt.Printf("Error serializing changes: %v\n", err)
					return
				}
				editorChangesQueue <- changesJSON
				broadcast <- msg
				// log.Printf("Code update: %s, by %s", msg.Changes.Text, msg.ClientId)
			} else {
				log.Printf("Unauthorized attempt to send code by client %s", msg.ClientId)
			}
		default:

			// TODO verify key
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
		fmt.Printf("Current queue change: %v \n", string(changesJSON))

		cmd := exec.Command("node", "editor_parser/editor_parser.js")
		cmd.Stdin = bytes.NewBuffer(changesJSON)
		var out bytes.Buffer
		cmd.Stdout = &out

		docFileMutex.Lock()
		err := cmd.Run()
		if err != nil {
			fmt.Printf("Error running Node.js script: %v\n", err)
			return
		}
		docFileMutex.Unlock()

		// fmt.Printf("Node.js script output: %s\n", out.String())
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

func getDocumentFilePath() (string, error) {
	var documentPath string
	var count int

	err := filepath.Walk(DATA_DIR, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() && strings.HasPrefix(info.Name(), "document-") {
			count++
			if count > 1 {
				return fmt.Errorf("multiple files with the prefix 'document-' found")
			}
			documentPath = path
		}
		return nil
	})

	if err != nil {
		return "", err
	}
	if count == 0 {
		return "", fmt.Errorf("no file with the prefix 'document-' found")
	}
	return documentPath, nil
}

func renameDocumentFile(newName string) error {
	filePath, err := getDocumentFilePath()
	if err != nil || filePath == "" {
		return fmt.Errorf("no document file found: %v", err)
	}

	dir := filepath.Dir(filePath)
	newFilePath := filepath.Join(dir, newName)

	err = os.Rename(filePath, newFilePath)
	if err != nil {
		return fmt.Errorf("failed to rename file: %v", err)
	}

	log.Printf("File renamed to: %s", newFilePath)
	return nil
}

func writeToDocument(data string) {
	filePath, err := getDocumentFilePath()
	if err != nil {
		log.Printf("No document file found: %v", err)
		return
	}
	if filePath == "" {
		filePath = DATA_DIR + "document-0"
	}
	if err := os.WriteFile(filePath, []byte(data), 0644); err != nil {
		log.Printf("Failed to write to file: %v", err)
	}

}

func getCurrentCodeId() (string, error) {
	filePath, err := getDocumentFilePath()
	if err != nil {
		log.Printf("No document file found: %v", err)
		return "", err
	}
	docIdStr := strings.TrimPrefix(filePath, "data/document-")

	return docIdStr, nil

}

func getUserCodeMissingChanges(userCodeId string) ([]Change, error) {
	currCodeId, err := getCurrentCodeId()
	if err != nil {
		fmt.Println("Error getting code id:", err)
		return nil, err
	}
	currCodeIdInt, err := strconv.Atoi(currCodeId)
	if err != nil {
		fmt.Println("Error converting to int:", err)
		return nil, err
	}
	newChanges := editorChangesHistory[currCodeIdInt:]
	return newChanges, nil

}

func GenerateSha256(input string) string {
	h := hmac.New(sha256.New, SECRET_256_KEY)
	h.Write([]byte(input))
	return hex.EncodeToString(h.Sum(nil))
}

func ValidateSha256(input, providedKey string) bool {
	expectedKey := GenerateSha256(input)
	return hmac.Equal([]byte(expectedKey), []byte(providedKey))
}
